/* SIH AMR Prototype — Dashboard rendering, task queue, fleet status, and controls
   Extracted reference functions from index.html.
   These functions share the global state defined by index.html.
   Keep index.html as the runnable prototype. */

function renderBotCards(){

  const list =
    document.getElementById(
      "botsList"
    );

  list.innerHTML = "";

  bots.forEach(bot=>{

    const p = nodes[bot.currentNode];

    const card =
      document.createElement("div");

    card.className =
      "bot-card" +
      (bot.id===selectedBotId ? " selected":"") +
      (bot.failed ? " failed":"");

    card.style.setProperty(
      "--bot-color",
      bot.color
    );

    card.onclick = e=>{

      if(
        e.target.closest("button")
      ){
        return;
      }

      if(!bot.failed){
        selectBot(bot.id);
      }
    };

    const runDisabled =
      bot.failed ||
      !bot.destination ||
      bot.path.length<2;

    const runLabel =
      bot.running
        ? "Pause"
        : bot.status==="paused"
          ? "Play"
          : "Resume";

    card.innerHTML = `
      <div class="bot-head">
        <span class="bot-dot"></span>
        <span class="bot-name">Bot ${bot.id}</span>
        <span class="status ${statusClass(bot)}">
          ${bot.status}
        </span>
      </div>

      <div class="bot-grid">

        <div class="info-box">
          <div class="info-label">Assignment</div>
          <div class="info-value">
            ${
              bot.takeover
                ? "TAKEOVER"
                : bot.task===TASK.ASSIGNED
                  ? "AUTO-ASSIGNED"
                  : bot.task===TASK.COMPLETED
                    ? "COMPLETED"
                    : "AVAILABLE"
            }
          </div>
        </div>

        <div class="info-box">
          <div class="info-label">Battery</div>
          <div class="info-value">
            ${Math.round(bot.battery)}%
          </div>
        </div>

      </div>

      <div class="task-box">

        <div class="info-label">Task</div>

        <div class="task-row">

          <div class="info-value">
            ${
              bot.task===TASK.UNASSIGNED
                ? TASK.UNASSIGNED
                : bot.taskName
            }
          </div>

          <div class="task-state ${taskClass(bot)}">
            ${bot.task}
          </div>

        </div>

        ${
          bot.failed && bot.task===TASK.COMPLETED && bot.failedTaskCompletedBy
            ? `<div class="task-complete-note">Completed by Bot ${bot.failedTaskCompletedBy}</div>`
            : ""
        }

      </div>

      <div class="location-line">
        CURRENT:
        <b>${tagOf[bot.currentNode]}</b>
        · ${bot.currentNode}
        · X:${Math.round(p.x)}
        Y:${Math.round(p.y)}
      </div>

      <div class="location-line">
        DEST:
        <b>
          ${
            bot.destination
              ? tagOf[bot.destination]
              : "—"
          }
        </b>
        ${
          bot.destination
            ? `· ${bot.destination}`
            : ""
        }
      </div>

      <div class="battery">
        <div
          class="battery-fill"
          style="width:${bot.battery}%">
        </div>
      </div>

      ${
        bot.note
          ? `<div class="note">${bot.note}</div>`
          : ""
      }

      <div class="bot-actions">

        <button
          class="run-btn ${bot.running ? "pause-mode":""}"
          ${runDisabled ? "disabled":""}
          onclick="toggleBotRun('${bot.id}')">
          ${runLabel}
        </button>

        ${
          bot.failed
            ? `
              <button
                class="recover-btn"
                onclick="recoverBot('${bot.id}')">
                Recover
              </button>
            `
            : `
              <button
                class="fail-btn"
                onclick="failBot('${bot.id}')">
                Simulate Failure
              </button>
            `
        }

      </div>
    `;

    list.appendChild(card);
  });
}

function renderLocations(){

  const rows =
    document.getElementById(
      "locationRows"
    );

  let html = "";

  /*
    Every AprilTag/node is included,
    so judges can see the real-time
    state of the complete warehouse graph.
  */
  for(const id in nodes){

    const p = nodes[id];

    const bot =
      bots.find(
        b=>b.currentNode===id
      );

    let state = "FREE";
    let cls = "free";

    if(obstacles.has(id)){
      state = "BLOCKED";
      cls = "blocked";
    }

    if(bot){

      if(bot.failed){
        state = `FAILED · BOT ${bot.id}`;
        cls = "failed-live";
      }else{
        state = `LIVE · BOT ${bot.id}`;
        cls = "live";
      }
    }

    html += `
      <div class="location-row">

        <span>${tagOf[id]}</span>

        <span>${id}</span>

        <span>
          ${Math.round(p.x)},
          ${Math.round(p.y)}
        </span>

        <span class="${cls}">
          ${state}
        </span>

      </div>
    `;
  }

  rows.innerHTML = html;
}

function renderTaskQueue(){

  const queueEl =
    document.getElementById("taskQueue");

  if(!queueEl) return;

  if(!taskQueue.length){

    queueEl.innerHTML =
      `<div class="queue-empty">No tasks queued. Click any AprilTag to create a task.</div>`;

    return;
  }

  queueEl.innerHTML =
    taskQueue.map(task=>{

      const bot =
        task.assignedBotId
          ? bots.find(b=>b.id===task.assignedBotId)
          : null;

      const statusText =
        task.status==="assigned"
          ? `Bot ${task.assignedBotId}`
          : task.status==="completed"
            ? "Completed"
            : task.failedBotId
              ? `Recovery · Bot ${task.failedBotId}`
              : "Waiting";

      return `
        <div class="task-card ${task.status} ${task.takeover?"failed-recovery":""}">

          <div class="task-card-status">
            ${task.status==="assigned" ? "Assigned" : task.status}
          </div>

          <div class="task-card-id">${task.id}</div>

          <div class="task-card-name">
            ${task.name}
          </div>

          <div class="task-card-meta">
            Goal: <b>${locLabel(task.destination)}</b><br>
            ${
              bot
                ? `AMR: <b>Bot ${bot.id}</b> · Current: ${locLabel(bot.currentNode)}`
                : statusText
            }
          </div>

        </div>
      `;
    }).join("");
}

function updateP2PDisplay(){
  const el=document.getElementById("p2pState");
  if(!el) return;

  const states=bots.map(b=>{
    const next=b.path && b.path.length>1 ? b.path[1] : "—";
    return `${b.id}:${tagOf[b.currentNode]}→${next==="—"?"—":tagOf[next]}`;
  });

  el.textContent=states.join("  ·  ");
}

function updatePerformanceDemo(){
  /*
    The dashboard records the actual decentralized elapsed time.
    The traditional value is a configurable baseline for the
    SAME scenario. It starts at 128 s for the SIH demo.
  */
  const activeTasks=taskQueue.filter(t=>t.status==="completed").length;
  const decEl=document.getElementById("decentralizedTime");
  const impEl=document.getElementById("improvementValue");

  if(!decEl || !impEl) return;

  const elapsed = window.demoStartTime
    ? Math.max(1, Math.round((Date.now()-window.demoStartTime)/1000))
    : 128;

  /*
    Don't claim an improvement before a completed scenario.
    Once tasks finish, show the measured elapsed time.
  */
  const measured =
    activeTasks>0
      ? elapsed
      : 128;

  const traditional =
    Number(document.getElementById("traditionalTime")?.textContent.replace("s","")) || 128;

  const improvement =
    Math.max(0, ((traditional-measured)/traditional)*100);

  decEl.textContent=`${measured}s`;
  impEl.textContent=`${improvement.toFixed(0)}%`;
}

function updateFleetStats(){

  const active =
    bots.filter(
      b=>!b.failed && b.running
    ).length;

  const completed =
    taskQueue.filter(
      t=>t.status==="completed"
    ).length;

  const failed =
    bots.filter(
      b=>b.failed
    ).length;

  const tasks =
    taskQueue.filter(
      t=>t.status!=="completed"
    ).length;

  document.getElementById("activeCount").textContent=active;
  document.getElementById("completedCount").textContent=completed;
  document.getElementById("failedCount").textContent=failed;
  document.getElementById("taskCount").textContent=tasks;
}

function selectBot(id){

  selectedBotId = id;

  bots.forEach(bot=>{
    const selected = bot.id===id;

    bot.ringEl.setAttribute(
      "stroke",
      selected ? "#fff2a0" : "transparent"
    );

    bot.gEl.classList.toggle(
      "selected-bot",
      selected
    );
  });

  renderBotCards();

  log(
    "info",
    `<b>Bot ${id}</b> selected. Now click an AprilTag square to set its destination.`
  );
}

function toggleAll(){

  const commandable = bots.filter(
    b=>
      !b.failed &&
      b.destination &&
      b.path.length>1
  );

  if(!commandable.length){

    log(
      "warn",
      "No assigned tasks are ready to run."
    );

    return;
  }

  const anyRunning = commandable.some(
    b=>b.running
  );

  if(anyRunning){

    document.getElementById("playAllBtn").textContent="⏸ Pause All";

    commandable.forEach(bot=>{
      if(bot.running){
        bot.running = false;
        bot.status = "paused";
      }
    });

    log(
      "info",
      "All active AMRs paused."
    );

  }else{

    window.demoStartTime = Date.now();
    document.getElementById("playAllBtn").textContent="▶ Play All";

    commandable.forEach(bot=>{
      bot.running = true;
      bot.status = "moving";
    });

    log(
      "info",
      "All assigned AMRs started simultaneously."
    );

    ensureRunning();
  }

  renderBotCards();
  updateFleetStats();
}

function toggleBotRun(id){

  const bot = bots.find(
    b=>b.id===id
  );

  if(
    !bot ||
    bot.failed ||
    !bot.destination ||
    bot.path.length<2
  ){
    return;
  }

  bot.running = !bot.running;

  if(bot.running){

    bot.status = "moving";

    log(
      "info",
      `<b>Bot ${bot.id}</b> started/resumed ${bot.taskName}.`
    );

    ensureRunning();

  }else{

    bot.status = "paused";

    log(
      "info",
      `<b>Bot ${bot.id}</b> paused at ${locLabel(bot.currentNode)}.`
    );
  }

  renderBotCards();
  updateFleetStats();
}

function onNodeClick(nodeId){

  if(obstacleMode){

    if(
      bots.some(
        b=>!b.failed && b.currentNode===nodeId
      )
    ){
      log("warn",`Node ${locLabel(nodeId)} is occupied by an AMR.`);
      return;
    }

    if(obstacles.has(nodeId)){

      obstacles.delete(nodeId);
      removeObstacle(nodeId);

      log("info",`Obstacle removed from ${locLabel(nodeId)}.`);

    }else{

      obstacles.add(nodeId);
      drawObstacle(nodeId);

      log("warn",`Obstacle placed at ${locLabel(nodeId)}.`);
      replanForObstacle(nodeId);
    }

    renderLocations();
    return;
  }

  /*
    Normal map click = CREATE A TASK.
    The operator does not choose the robot.
    The fleet chooses the available AMR with the
    shortest feasible A* path to the selected goal.
  */
  createTask(nodeId);
}
