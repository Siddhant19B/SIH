/* SIH AMR Prototype — AMR failure handling, dynamic-obstacle broadcast, recovery, and takeover
   Extracted reference functions from index.html.
   These functions share the global state defined by index.html.
   Keep index.html as the runnable prototype. */

function failBot(id){

  const bot = bots.find(
    b=>b.id===id
  );

  if(!bot || bot.failed) return;

  const hadTask = !!bot.destination;

  const failedTask = {
    taskName:bot.taskName,
    destination:bot.destination,
    taskId:bot.taskId,
    originalBotId:bot.id
  };

  bot.failedTaskName = bot.taskName;
  bot.failedTaskId = bot.taskId;
  bot.failedTaskDestination = bot.destination;
  bot.failedTaskCompletedBy = null;

  bot.failed = true;
  bot.running = false;
  bot.status = "failed";

  /* Keep the failed task visible until a peer completes it. */
  bot.task = hadTask ? TASK.ASSIGNED : TASK.UNASSIGNED;
  if(!hadTask) bot.taskName = "Task Not Assigned";

  bot.destination = null;
  bot.path = [bot.currentNode];
  bot.taskId = hadTask ? bot.failedTaskId : null;

  bot.pathEl.setAttribute("d","");
  if(bot.pathUnderlayEl) bot.pathUnderlayEl.setAttribute("d","");
  hideGoal(bot);

  drawFailedBot(bot);

  log(
    "conflict",
    `<b>BOT ${bot.id} FAILURE</b> detected at ${locLabel(bot.currentNode)}. AMR stopped and is now a dynamic obstacle.`
  );
  log(
    "sms",
    `ALERT: Bot ${bot.id} has FAILED at ${locLabel(bot.currentNode)}. P2P fleet update: ${locLabel(bot.currentNode)} is now a dynamic obstacle.`
  );

  /*
    Decentralized peer update:
    every surviving AMR gets the failed AMR's
    location as part of its local world model.
  */
  broadcastFailure(bot);

  /*
    Each active AMR independently replans.
  */
  bots.forEach(other=>{

    if(
      other===bot ||
      other.failed ||
      !other.running ||
      !other.destination
    ){
      return;
    }

    const blocked = getBlockedNodes(other);

    blocked.add(bot.currentNode);
    blocked.delete(other.destination);

    const newPath = aStar(
      other.currentNode,
      other.destination,
      blocked
    );

    if(newPath && newPath.length>1){

      other.path = newPath;
      other.note = `Local route updated around failed Bot ${bot.id}.`;

      drawBotPath(
        other,
        newPath,
        true
      );

      log(
        "reroute",
        `<b>Bot ${other.id}</b> independently replanned around failed Bot ${bot.id} using A*.`
      );

    }else{

      other.status = "waiting";
      other.waitingFor = `failed Bot ${bot.id}`;

      log(
        "conflict",
        `<b>Bot ${other.id}</b> cannot currently find a safe alternate route around failed Bot ${bot.id}.`
      );
    }
  });

  /*
    Reassign the task to a completed,
    available AMR.
  */
  if(failedTask.destination){
    reassignTask(failedTask,bot);
  }

  renderBotCards();
  renderLocations();
  renderTaskQueue();
  updateFleetStats();
}

function drawFailedBot(bot){

  const p = nodes[bot.currentNode];

  /* Remove any remaining route highlight for the failed AMR. */
  if(bot.pathEl){
    bot.pathEl.setAttribute("d","");
  }
  if(bot.pathUnderlayEl){
    bot.pathUnderlayEl.setAttribute("d","");
  }

  /* Remove any previous failure marker for this bot. */
  if(bot.failedVisual){
    bot.failedVisual.remove();
  }

  const g = el("g",{
    class:"failed-bot-marker",
    "pointer-events":"none"
  });

  /*
    Keep the original bot colour visible, then place a clean
    failure X over it. No black path is drawn.
  */
  g.appendChild(el("circle",{
    cx:p.x,
    cy:p.y,
    r:29,
    fill:bot.color,
    stroke:"#ffffff",
    "stroke-width":3
  }));

  g.appendChild(el("circle",{
    cx:p.x,
    cy:p.y,
    r:34,
    fill:"none",
    stroke:"#ff3b4d",
    "stroke-width":4
  }));

  g.appendChild(el("line",{
    x1:p.x-13,
    y1:p.y-13,
    x2:p.x+13,
    y2:p.y+13,
    stroke:"#ff3b4d",
    "stroke-width":7,
    "stroke-linecap":"round"
  }));

  g.appendChild(el("line",{
    x1:p.x+13,
    y1:p.y-13,
    x2:p.x-13,
    y2:p.y+13,
    stroke:"#ff3b4d",
    "stroke-width":7,
    "stroke-linecap":"round"
  }));

  const label = el("text",{
    x:p.x,
    y:p.y-43,
    "text-anchor":"middle",
    fill:"#ff6570",
    "font-size":13,
    "font-weight":"800",
    "font-family":"Segoe UI,Arial"
  });
  label.textContent = "FAILED";
  g.appendChild(label);

  failedLayer.appendChild(g);
  bot.failedVisual = g;
}

function broadcastFailure(failedBot){

  log(
    "info",
    `PEER UPDATE: Bot ${failedBot.id} failure state shared with the fleet.`
  );

  bots.forEach(bot=>{
    if(
      bot!==failedBot &&
      !bot.failed
    ){
      bot.note =
        `Peer update: Bot ${failedBot.id} unavailable.`;
    }
  });
}

function recoverBot(id){

  const bot =
    bots.find(
      b=>b.id===id
    );

  if(!bot || !bot.failed)
    return;

  if(failedIcons[bot.id]){
    failedIcons[bot.id].remove();
    delete failedIcons[bot.id];
  }

  bot.failed = false;
  bot.status = "idle";
  bot.battery = Math.max(25,bot.battery);
  bot.task = TASK.UNASSIGNED;
  bot.taskName = "Task Not Assigned";
  bot.taskId = null;
  bot.destination = null;
  bot.path = [bot.currentNode];
  bot.note = "Recovered and available for a new task.";

  log(
    "info",
    `<b>Bot ${bot.id}</b> recovered at ${locLabel(bot.currentNode)} and is available.`
  );

  renderBotCards();
  renderLocations();
  updateFleetStats();
}
