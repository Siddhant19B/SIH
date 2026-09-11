/* SIH AMR Prototype — A* pathfinding, dynamic obstacles, and live replanning
   Extracted reference functions from index.html.
   These functions share the global state defined by index.html.
   Keep index.html as the runnable prototype. */

function heuristic(a,b){
  const dx = nodes[a].x - nodes[b].x;
  const dy = nodes[a].y - nodes[b].y;
  return Math.sqrt(dx*dx + dy*dy);
}

function aStar(start,end,blocked = new Set()){

  if(blocked.has(start)) blocked.delete(start);
  blocked.delete(end);

  const g = {};
  const f = {};
  const prev = {};
  const closed = new Set();

  for(const id in nodes){
    g[id] = Infinity;
    f[id] = Infinity;
  }

  g[start] = 0;
  f[start] = heuristic(start,end);

  const open = [[f[start],start]];

  while(open.length){

    open.sort((a,b)=>a[0]-b[0]);

    const [,u] = open.shift();

    if(closed.has(u)) continue;

    closed.add(u);

    if(u === end) break;

    for(const edge of adj[u]){

      if(blocked.has(edge.to) && edge.to !== end){
        continue;
      }

      const tentative = g[u] + edge.dist;

      if(tentative < g[edge.to]){

        prev[edge.to] = u;
        g[edge.to] = tentative;
        f[edge.to] = tentative + heuristic(edge.to,end);

        open.push([f[edge.to],edge.to]);
      }
    }
  }

  if(g[end] === Infinity) return null;

  const path = [end];
  let cur = end;

  while(cur !== start){
    cur = prev[cur];
    path.unshift(cur);
  }

  return path;
}

function pathDistance(path){

  let total = 0;

  for(let i=1;i<path.length;i++){

    const a = nodes[path[i-1]];
    const b = nodes[path[i]];

    total += Math.hypot(
      a.x-b.x,
      a.y-b.y
    );
  }

  return total;
}

function getBlockedNodes(forBot){

  const blocked = new Set(obstacles);

  bots.forEach(bot=>{

    if(bot===forBot) return;

    /* Failed AMRs are permanent dynamic obstacles */
    if(bot.failed){
      blocked.add(bot.currentNode);
      return;
    }

    /*
      Paused/idle AMRs occupy their current physical node.
      Moving AMRs are handled through live collision negotiation.
    */
    if(!bot.running){
      blocked.add(bot.currentNode);
    }
  });

  blocked.delete(forBot.currentNode);

  if(forBot.destination){
    blocked.delete(forBot.destination);
  }

  return blocked;
}

function refreshLivePaths(){

  bots.forEach(bot=>{

    if(
      bot.failed ||
      !bot.running ||
      !bot.destination ||
      !bot.path ||
      bot.path.length<2
    ){
      return;
    }

    /*
      Recalculate from the CURRENT node every tick.
      All other AMR positions are treated as dynamic
      obstacles for this local planning decision.
    */
    const blocked = getBlockedNodes(bot);

    bots.forEach(other=>{
      if(other!==bot){
        blocked.add(other.currentNode);
      }
    });

    blocked.delete(bot.currentNode);
    blocked.delete(bot.destination);

    const livePath = aStar(
      bot.currentNode,
      bot.destination,
      blocked
    );

    if(!livePath || livePath.length<2){
      return;
    }

    const currentCost = pathDistance(bot.path);
    const liveCost = pathDistance(livePath);

    /*
      If another AMR has moved and the original/direct route
      is available again, immediately return to the better path.
      Also switch whenever the live path is meaningfully shorter.
    */
    if(
      livePath[1]!==bot.path[1] ||
      liveCost < currentCost - 1
    ){

      const changed =
        bot.path.length!==livePath.length ||
        bot.path.some((n,i)=>n!==livePath[i]);

      if(changed){

        bot.path = livePath;
        bot.status = "moving";

        drawBotPath(
          bot,
          livePath,
          false
        );
      }
    }
  });
}

function replanForObstacle(nodeId){

  bots.forEach(bot=>{

    if(
      bot.failed ||
      !bot.destination ||
      !bot.path ||
      !bot.path.slice(1).includes(nodeId)
    ){
      return;
    }

    const blocked = getBlockedNodes(bot);
    blocked.add(nodeId);
    blocked.delete(bot.destination);

    const newPath = aStar(
      bot.currentNode,
      bot.destination,
      blocked
    );

    if(newPath && newPath.length>1){

      bot.path = newPath;
      bot.note = "Obstacle detected. Local A* route updated.";

      drawBotPath(bot,newPath,true);

      log(
        "reroute",
        `<b>Bot ${bot.id}</b> locally replanned around obstacle ${locLabel(nodeId)}.`
      );

    }else{

      bot.status = "waiting";
      bot.waitingFor = "obstacle";

      log(
        "conflict",
        `<b>Bot ${bot.id}</b> is waiting because the new obstacle blocks its current route.`
      );
    }
  });

  renderBotCards();
}
