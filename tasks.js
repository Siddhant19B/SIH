/* SIH AMR Prototype — Task creation, shortest-path allocation, queueing, reassignment, and completion
   Extracted reference functions from index.html.
   These functions share the global state defined by index.html.
   Keep index.html as the runnable prototype. */

function createTask(destination){

  if(obstacles.has(destination)){

    log(
      "warn",
      `Cannot create a task at blocked destination ${locLabel(destination)}.`
    );

    return;
  }

  const task = {
    id:`TASK-${String(nextTaskNumber++).padStart(3,"0")}`,
    name:`Warehouse Task ${String(nextTaskNumber-1).padStart(3,"0")}`,
    destination,
    status:"queued",
    assignedBotId:null,
    failedBotId:null,
    takeover:false,
    createdAt:Date.now()
  };

  taskQueue.push(task);

  log(
    "info",
    `<b>${task.id}</b> added to queue for destination <b>${locLabel(destination)}</b>.`
  );

  dispatchQueuedTasks();

  renderTaskQueue();
  renderBotCards();
  updateFleetStats();
}

function findBestTaskAssignment(){

  let best = null;

  for(const task of taskQueue){

    if(task.status!=="queued") continue;

    for(const bot of availableBots()){

      const blocked = getBlockedNodes(bot);
      blocked.delete(task.destination);

      const path = aStar(
        bot.currentNode,
        task.destination,
        blocked
      );

      if(!path || path.length<2) continue;

      const cost = pathDistance(path);

      if(!best || cost<best.cost){

        best = {
          task,
          bot,
          path,
          cost
        };
      }
    }
  }

  return best;
}

function dispatchQueuedTasks(){

  while(true){

    const best = findBestTaskAssignment();

    if(!best) break;

    const {task,bot,path} = best;

    task.status = "assigned";
    task.assignedBotId = bot.id;

    if(task.takeover && task.failedBotId){

      const failedBot =
        bots.find(b=>b.id===task.failedBotId) ||
        {id:task.failedBotId};

      /*
        A failed task is a temporary takeover:
        remember the receiving bot's current position so it
        can return there after completing the recovery task.
      */
      bot.originalPosition = bot.currentNode;
      const pickupPlan = getTakeoverPickupPlan(bot,failedBot);
      if(!pickupPlan || !pickupPlan.path){
        task.status="queued";
        task.assignedBotId=null;
        break;
      }

      bot.originalPosition = bot.currentNode;
      bot.takeover = true;
      bot.takeoverPhase = "pickup";
      bot.takeoverPickupNode = pickupPlan.pickup;
      bot.takeoverTaskName = task.name;
      bot.takeoverTaskId = task.id;
      bot.takeoverFailedBotId = task.failedBotId;
      bot.takeoverDestination = task.destination;

      bot.task = TASK.REASSIGNED;
      bot.taskName = task.name;
      bot.taskId = task.id;
      bot.destination = pickupPlan.pickup;
      bot.path = pickupPlan.path;
      bot.running = isFleetPlaying();
      bot.status = bot.running ? "moving" : "ready";
      bot.note = bot.running
        ? `Going to failed Bot ${failedBot.id} to pick up the parcel, then deliver to ${locLabel(task.destination)}.`
        : `Pickup route prepared near failed Bot ${failedBot.id}. Press Play All to approach, pick up parcel, then deliver to ${locLabel(task.destination)}.`;

      log(
        "sms",
        `SMS: ${task.name} reassigned from failed Bot ${failedBot.id} to Bot ${bot.id}.`
      );

    }else{

      bot.task = TASK.ASSIGNED;
      bot.taskName = task.name;
      bot.taskId = task.id;
      bot.destination = task.destination;
      bot.path = path;
      bot.running = isFleetPlaying();
      bot.status = bot.running ? "moving" : "ready";
      bot.note = bot.running
        ? `Shortest A* route active. AMR is moving.`
        : `Shortest A* route prepared. Press Play All to start.`;

      log(
        "info",
        `<b>${bot.id}</b> accepted <b>${task.id}</b> — shortest feasible A* path: ${Math.round(best.cost)} units.`
      );
    }

    if(task.takeover && task.failedBotId){
      drawBotPath(bot,bot.path,true);
      showGoal(bot,bot.destination);
    }else{
      drawBotPath(bot,path,true);
      showGoal(bot,task.destination);
    }
  }

  // Task assignment prepares the route only.
  // Movement starts only when the operator presses "Play All".

  renderTaskQueue();
  renderBotCards();
  updateFleetStats();
}

function reassignTask(failedTask,failedBot){

  if(!failedTask.destination) return;

  /*
    Failed task returns to the SAME global task queue.
    It will be assigned to the closest available AMR.
  */
  let task = taskQueue.find(
    t=>t.id===failedTask.taskId
  );

  if(!task){

    task = {
      id:failedTask.taskId || `TASK-${String(nextTaskNumber++).padStart(3,"0")}`,
      name:failedTask.taskName || `Warehouse Task ${nextTaskNumber-1}`,
      destination:failedTask.destination,
      status:"queued",
      assignedBotId:null,
      failedBotId:failedBot.id,
      takeover:true,
      createdAt:Date.now()
    };

    taskQueue.push(task);

  }else{

    task.status = "queued";
    task.assignedBotId = null;
    task.failedBotId = failedBot.id;
    task.takeover = true;
  }

  log(
    "warn",
    `Task <b>${task.id}</b> returned to the queue after Bot ${failedBot.id} failure.`
  );

  dispatchQueuedTasks();
  renderTaskQueue();
}

function processPendingReassignments(){

  dispatchQueuedTasks();
}

function completeTask(bot){
  const taskName=bot.taskName;
  const destination=bot.destination;

  if(!bot.takeover){
    bot.status="arrived";
    bot.running=false;
    bot.task=TASK.COMPLETED;

    const completedTask =
      taskQueue.find(t=>t.id===bot.taskId);

    if(completedTask){
      completedTask.status="completed";
      completedTask.assignedBotId=bot.id;
    }

    bot.destination=null;
    bot.path=[bot.currentNode];
    bot.pathEl.setAttribute("d","");
    hideGoal(bot);

    log(
      "arrive",
      `<b>Bot ${bot.id}</b> reached ${locLabel(destination)}.`
    );

    log(
      "sms",
      `SMS: Task completed — "${taskName}" completed successfully by Bot ${bot.id}.`
    );

    /*
      The bot is immediately available for the next queued task.
      Dispatch calculates the closest A* task from this NEW position.
    */
    bot.status="idle";
    bot.task=TASK.UNASSIGNED;
    bot.taskName="Task Not Assigned";
    bot.taskId=null;
    bot.note="Task complete. Checking queued work from current position.";

    dispatchQueuedTasks();

    renderTaskQueue();
    renderBotCards();
    updateFleetStats();
    return;
  }

  const originalPosition=bot.originalPosition;
  log("arrive",`<b>Bot ${bot.id}</b> completed reassigned task "${taskName}" at ${locLabel(destination)}.`);
  log("sms",`SMS: Task completed — "${taskName}" completed by Bot ${bot.id}. Returning to original position.`);

  const takeoverTask =
    taskQueue.find(t=>t.id===bot.taskId);

  if(takeoverTask){
    takeoverTask.status="completed";
    takeoverTask.assignedBotId=bot.id;
  }

  markFailedTaskCompleted(bot);

  if(originalPosition&&originalPosition!==bot.currentNode){
    const blocked=getBlockedNodes(bot); blocked.delete(originalPosition);
    const returnPath=aStar(bot.currentNode,originalPosition,blocked);
    if(returnPath&&returnPath.length>1){
      bot.destination=originalPosition; bot.path=returnPath; bot.running=true; bot.status="moving"; bot.waitingFor=null;
      bot.note=`Reassigned task complete. Returning to original position ${locLabel(originalPosition)}.`;
      drawBotPath(bot,returnPath,true); showGoal(bot,originalPosition);
      log("reroute",`<b>Bot ${bot.id}</b> returning to its original position ${locLabel(originalPosition)}.`);
      ensureRunning(); renderBotCards(); updateFleetStats(); return;
    }
    bot.destination=originalPosition; bot.path=[bot.currentNode]; bot.running=true; bot.status="waiting"; bot.waitingFor="safe return path";
    bot.note=`Task complete. Waiting for a safe route to ${locLabel(originalPosition)}.`;
    log("conflict",`<b>Bot ${bot.id}</b> completed the takeover task but is waiting for a safe return route.`);
    ensureRunning(); renderBotCards(); updateFleetStats(); return;
  }
  finishTakeoverReturn(bot);
}

function markFailedTaskCompleted(bot){
  const failedBot = bots.find(b=>b.id===bot.takeoverFailedBotId);
  if(!failedBot) return;

  failedBot.task = TASK.COMPLETED;
  failedBot.taskName = failedBot.failedTaskName || failedBot.taskName;
  failedBot.taskId = failedBot.failedTaskId || failedBot.taskId;
  failedBot.failedTaskCompletedBy = bot.id;

  log(
    "sms",
    `SMS: Failed Bot ${failedBot.id}'s task "${failedBot.taskName}" is COMPLETED by Bot ${bot.id}.`
  );
}
