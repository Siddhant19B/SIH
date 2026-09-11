/* SIH AMR Prototype — Movement loop, takeover pickup/delivery, and play/pause control
   Extracted reference functions from index.html.
   These functions share the global state defined by index.html.
   Keep index.html as the runnable prototype. */

function simTick(){

  /*
    Re-evaluate every active route before collision negotiation.
    This makes the system truly dynamic: if a bot has moved out
    of the way, another AMR can come back onto its best A* route.
  */
  refreshLivePaths();

  /* Retry a blocked return after a takeover task. */
  bots.forEach(bot=>{
    if(bot.takeover&&bot.status==="waiting"&&bot.destination===bot.originalPosition){
      const blocked=getBlockedNodes(bot); blocked.delete(bot.originalPosition);
      const returnPath=aStar(bot.currentNode,bot.originalPosition,blocked);
      if(returnPath&&returnPath.length>1){
        bot.path=returnPath; bot.running=true; bot.status="moving"; bot.waitingFor=null;
        bot.note=`Safe return path found. Returning to ${locLabel(bot.originalPosition)}.`;
        drawBotPath(bot,returnPath,true); showGoal(bot,bot.originalPosition);
        log("reroute",`<b>Bot ${bot.id}</b> found a safe return path to ${locLabel(bot.originalPosition)}.`);
      }
    }
  });

  /*
    Every running AMR independently proposes
    its next node. Live A* replanning resolves dynamic conflicts.
  */

  const active = bots.filter(
    b=>
      !b.failed &&
      b.running &&
      b.path &&
      b.path.length>1
  );

  const occupied = new Set(
    bots.map(
      b=>b.currentNode
    )
  );

  const reservations = new Map();
  const movers = [];

  for(const bot of active){

    const next = bot.path[1];

    let blocker = null;

    if(obstacles.has(next)){

      blocker = {
        type:"obstacle",
        name:"Obstacle"
      };

    }

    const failed = bots.find(
      b=>
        b.failed &&
        b.currentNode===next
    );

    if(failed){

      blocker = {
        type:"failed",
        bot:failed
      };

    }

    if(
      !blocker &&
      reservations.has(next)
    ){

      blocker = {
        type:"reservation",
        bot:reservations.get(next)
      };

    }

    /*
      Detect head-on swap.
    */
    if(!blocker){

      const headOn = bots.find(
        b=>
          b!==bot &&
          !b.failed &&
          b.running &&
          b.path &&
          b.path.length>1 &&
          b.currentNode===next &&
          b.path[1]===bot.currentNode
      );

      if(headOn){

        blocker = {
          type:"headon",
          bot:headOn
        };
      }
    }

    /*
      Stationary AMR blocks a node.
    */
    if(
      !blocker &&
      occupied.has(next)
    ){

      const occupant = bots.find(
        b=>
          b!==bot &&
          b.currentNode===next &&
          !b.failed &&
          !b.running
      );

      if(occupant){

        blocker = {
          type:"stationary",
          bot:occupant
        };
      }
    }

    if(blocker){

      const blocked = getBlockedNodes(bot);
      blocked.add(next);

      if(bot.destination){
        blocked.delete(bot.destination);
      }

      const newPath = bot.destination
        ? aStar(
            bot.currentNode,
            bot.destination,
            blocked
          )
        : null;

      if(
        newPath &&
        newPath.length>1
      ){

        bot.path = newPath;
        bot.waitTicks = 0;
        bot.status = "moving";

        drawBotPath(
          bot,
          newPath,
          true
        );

        const blockerName =
          blocker.bot
            ? `Bot ${blocker.bot.id}`
            : blocker.name;

        log(
          "reroute",
          `<b>Bot ${bot.id}</b> detected a conflict with ${blockerName} and locally replanned using A*.`
        );

        continue;

      }

      bot.waitTicks++;
      bot.status = "waiting";

      bot.waitingFor =
        blocker.bot
          ? `Bot ${blocker.bot.id}`
          : blocker.name;

      log(
        "conflict",
        `<b>Bot ${bot.id}</b> waiting for ${bot.waitingFor}.`
      );

      continue;
    }

    /*
      Node reserved for this tick.
    */
    reservations.set(next,bot);
    movers.push(bot);
  }


  /*
    Move all approved AMRs concurrently.
  */
  movers.forEach(bot=>{

    bot.currentNode =
      bot.path[1];

    bot.path.shift();

    bot.waitTicks = 0;

    drawBotPath(
      bot,
      bot.path,
      false
    );

    if(
      bot.path.length<=1 &&
      bot.destination
    ){
      if(bot.takeover && bot.takeoverPhase==="pickup"){
        reachTakeoverPickup(bot);
      }else if(bot.takeover && bot.destination===bot.originalPosition){
        finishTakeoverReturn(bot);
      }else{
        completeTask(bot);
      }
    }
  });


  /*
    Live replanning keeps the fleet moving without fixed priority.
  */
  bots.forEach(bot=>{

    if(
      !bot.failed &&
      bot.status==="waiting"
    ){

      bot.effectiveAssignment =
        Math.max(
          -10,
          bot.priority -
          bot.waitTicks*0.2
        );

    }

    if(!bot.failed){

      const moved =
        movers.includes(bot);

      bot.battery =
        Math.max(
          0,
          bot.battery -
          (moved ? .8 : .15)
        );
    }
  });


  updatePositions(false);
  renderBotCards();
  renderLocations();
  updateFleetStats();


  const stillRunning =
    bots.some(
      b=>
        !b.failed &&
        b.running &&
        b.destination &&
        b.path.length>1
    );

  if(!stillRunning){

    clearInterval(timer);
    timer = null;
  }

}

function ensureRunning(){

  if(!timer){
    timer = setInterval(
      simTick,
      tickMs
    );
  }
}

function isFleetPlaying(){
  return bots.some(b=>!b.failed && b.running);
}

function getTakeoverPickupPlan(bot,failedBot){
  if(!failedBot || failedBot.currentNode==null) return null;

  const blockedBase=getBlockedNodes(bot);
  blockedBase.add(failedBot.currentNode);

  let best=null;

  (adj[failedBot.currentNode]||[]).forEach(edge=>{
    const pickup=edge.to;
    if(pickup===bot.currentNode && !blockedBase.has(pickup)){
      const candidate={path:[bot.currentNode],pickup};
      if(!best || candidate.path.length<best.path.length) best=candidate;
      return;
    }
    if(blockedBase.has(pickup)) return;

    const path=aStar(bot.currentNode,pickup,blockedBase);
    if(!path) return;

    const cost=pathDistance(path);
    if(!best || cost<best.cost){
      best={path,pickup,cost};
    }
  });

  return best;
}

function reachTakeoverPickup(bot){
  const wasFleetPlaying = isFleetPlaying() || !!window.demoStartTime;
  bot.running=wasFleetPlaying;
  bot.status=wasFleetPlaying ? "moving" : "arrived";
  bot.takeoverPhase="pickup";
  bot.takeoverPickupNode=bot.currentNode;
  bot.note=`At pickup point near failed Bot ${bot.takeoverFailedBotId}. Parcel pickup in progress.`;

  log(
    "arrive",
    `<b>Bot ${bot.id}</b> reached the pickup point near failed Bot ${bot.takeoverFailedBotId}.`
  );
  log(
    "info",
    `<b>Bot ${bot.id}</b> picked up the parcel from the failed AMR. Replanning to the original goal with A*.`
  );

  // The parcel is now on the takeover AMR; continue toward the final goal.
  startTakeoverDelivery(bot);

  // Keep the takeover AMR moving if the fleet was already playing.
  if(wasFleetPlaying){
    bot.running=true;
    bot.status="moving";
    ensureRunning();
  }else{
    bot.running=false;
    bot.status="ready";
  }

  renderBotCards();
  updateFleetStats();
}

function startTakeoverDelivery(bot){
  const finalGoal=bot.takeoverDestination;
  if(!finalGoal) return false;

  const blocked=getBlockedNodes(bot);
  blocked.delete(finalGoal);

  const deliveryPath=aStar(bot.currentNode,finalGoal,blocked);
  if(!deliveryPath) return false;

  bot.takeoverPhase="delivery";
  bot.destination=finalGoal;
  bot.path=deliveryPath;
  bot.running=bot.running; // preserve current Play/Pause state
  bot.status=bot.running ? "moving" : "ready";
  bot.waitingFor=null;
  bot.note=`Parcel picked up from failed Bot ${bot.takeoverFailedBotId}. Delivering to ${locLabel(finalGoal)}.`;

  drawBotPath(bot,deliveryPath,true);
  showGoal(bot,finalGoal);

  log(
    "sms",
    `SMS: Bot ${bot.id} reached failed Bot ${bot.takeoverFailedBotId}'s location, picked up the parcel, and is now heading to ${locLabel(finalGoal)}.`
  );
  renderBotCards();
  return true;
}

function finishTakeoverReturn(bot){
  const returnedTo=bot.originalPosition||bot.currentNode;
  bot.running=false; bot.status="idle"; bot.task=TASK.UNASSIGNED; bot.taskName="Task Not Assigned"; bot.taskId=null;
  bot.destination=null; bot.path=[bot.currentNode]; bot.takeover=false; bot.originalPosition=null; bot.takeoverPhase=null; bot.takeoverPickupNode=null;
  bot.takeoverTaskName=null; bot.takeoverTaskId=null; bot.takeoverFailedBotId=null; bot.takeoverDestination=null; bot.waitingFor=null;
  bot.note=`Available at original position ${locLabel(returnedTo)}.`;
  bot.pathEl.setAttribute("d",""); hideGoal(bot);
  log("sms",`SMS: Bot ${bot.id} returned to its original position ${locLabel(returnedTo)} and is available.`);
  dispatchQueuedTasks(); renderTaskQueue(); renderBotCards(); renderLocations(); updateFleetStats();
}
