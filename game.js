"use strict";

const canvas = document.getElementById("bridge");
const ctx = canvas.getContext("2d");
const materialSelect = document.getElementById("material");
const eraseButton = document.getElementById("erase");
const testButton = document.getElementById("test");
const hint = document.getElementById("hint");
const result = document.getElementById("result");
const budget = 6500;
const left = 160;
const right = 840;
const deckY = 260;
const deckCount = 11;
const step = (right - left) / (deckCount - 1);
const materials = {
  steel: { color: "#e5b562", strength: 52, price: 1.55, width: 7 },
  timber: { color: "#b58e6b", strength: 30, price: 0.9, width: 8 },
  cable: { color: "#78c4c2", strength: 34, price: 0.55, width: 3 }
};

let nodes = [];
let members = [];
let selected = null;
let erasing = false;
let test = null;
let bestScore = null;
let animationFrame = null;

function resetDesign() {
  nodes = Array.from({ length: deckCount }, (_, i) => ({
    x: left + i * step, y: deckY, fixed: true
  }));
  members = [];
  selected = null;
  stopTest();
  updateStats();
  draw();
}

function stopTest() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  test = null;
  testButton.disabled = false;
}

function designCost() {
  return Math.round(members.reduce((sum, member) => {
    const a = nodes[member.a];
    const b = nodes[member.b];
    return sum + Math.hypot(a.x - b.x, a.y - b.y) * materials[member.type].price;
  }, 0));
}

function updateStats() {
  const cost = designCost();
  document.getElementById("cost").textContent = cost.toLocaleString();
  document.getElementById("members").textContent = String(members.length);
  document.getElementById("joints").textContent = `${nodes.length} joints total`;
  document.getElementById("budget-note").textContent = `${Math.max(0, budget - cost).toLocaleString()} credits remaining`;
  document.querySelector(".metric").classList.toggle("over", cost > budget);
}

function changed() {
  stopTest();
  document.getElementById("reserve").textContent = "—";
  result.className = "result";
  result.textContent = "Design changed. Run a new vehicle test.";
  updateStats();
  draw();
}

function memberCapacity(member) {
  const a = nodes[member.a];
  const b = nodes[member.b];
  const length = Math.hypot(a.x - b.x, a.y - b.y);
  const slope = Math.abs(a.y - b.y) / length;
  const geometry = member.type === "cable"
    ? (slope < 0.25 ? 0.10 : 0.85)
    : (slope < 0.25 ? 0.26 : 1);
  return materials[member.type].strength * Math.min(1.25, 170 / length) * geometry;
}

function widestPaths(start) {
  const values = Array(nodes.length).fill(0);
  const visited = Array(nodes.length).fill(false);
  values[start] = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    let current = -1;
    for (let j = 0; j < nodes.length; j++) {
      if (!visited[j] && (current === -1 || values[j] > values[current])) current = j;
    }
    if (current === -1 || values[current] === 0) break;
    visited[current] = true;
    for (const member of members) {
      const next = member.a === current ? member.b : member.b === current ? member.a : -1;
      if (next < 0 || visited[next]) continue;
      values[next] = Math.max(values[next], Math.min(values[current], memberCapacity(member)));
    }
  }
  return values;
}

function evaluateDesign() {
  const fromLeft = widestPaths(0);
  const fromRight = widestPaths(deckCount - 1);
  const reserves = [];
  for (let i = 1; i < deckCount - 1; i++) {
    const position = i / (deckCount - 1);
    const demand = 21 + 13 * Math.sin(Math.PI * position);
    const capacity = 0.8 * (fromLeft[i] + fromRight[i]);
    reserves.push(capacity / demand);
  }
  return reserves;
}

function snap(point) {
  return {
    x: Math.max(left, Math.min(right, left + Math.round((point.x - left) / 34) * 34)),
    y: Math.max(90, Math.min(430, deckY + Math.round((point.y - deckY) / 34) * 34))
  };
}

function pointFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height
  };
}

function nearestNode(point) {
  let found = -1;
  let distance = 15;
  nodes.forEach((node, i) => {
    const d = Math.hypot(node.x - point.x, node.y - point.y);
    if (d < distance) { distance = d; found = i; }
  });
  return found;
}

function nearestMember(point) {
  let found = -1;
  let distance = 11;
  members.forEach((member, i) => {
    const a = nodes[member.a];
    const b = nodes[member.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    if (d < distance) { distance = d; found = i; }
  });
  return found;
}

canvas.addEventListener("pointerdown", event => {
  if (test) return;
  const point = pointFromEvent(event);
  const index = nearestNode(point);
  if (erasing) {
    if (index >= deckCount) {
      members = members.filter(m => m.a !== index && m.b !== index)
        .map(m => ({ ...m, a: m.a > index ? m.a - 1 : m.a, b: m.b > index ? m.b - 1 : m.b }));
      nodes.splice(index, 1);
      selected = null;
      changed();
    } else if (nearestMember(point) !== -1) {
      members.splice(nearestMember(point), 1);
      selected = null;
      changed();
    } else {
      hint.textContent = "Fixed deck joints cannot be erased.";
    }
    return;
  }

  if (index !== -1) {
    if (selected === null) {
      selected = index;
      hint.textContent = "Now click another joint to connect them. Press Escape to cancel.";
    } else if (selected === index) {
      selected = null;
      hint.textContent = "Selection canceled.";
    } else {
      if (members.some(m => (m.a === selected && m.b === index) || (m.b === selected && m.a === index))) {
        hint.textContent = "Those joints are already connected. Erase that member to replace it.";
      } else {
        members.push({ a: selected, b: index, type: materialSelect.value });
        hint.textContent = "Member added. Click a joint to start another.";
        changed();
      }
      selected = null;
    }
    draw();
    return;
  }
  if (point.x < left - 15 || point.x > right + 15 || point.y < 75 || point.y > 445) return;
  const position = snap(point);
  if (position.y === deckY || nodes.some(n => n.x === position.x && n.y === position.y)) {
    hint.textContent = "Choose an empty grid point above or below the deck.";
    return;
  }
  nodes.push({ ...position, fixed: false });
  if (selected !== null) {
    members.push({ a: selected, b: nodes.length - 1, type: materialSelect.value });
    selected = null;
    hint.textContent = "Joint and member added.";
  } else {
    hint.textContent = "Joint added. Click two joints to connect them.";
  }
  changed();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    selected = null;
    hint.textContent = "Selection canceled.";
    draw();
  }
});

eraseButton.addEventListener("click", () => {
  erasing = !erasing;
  selected = null;
  eraseButton.setAttribute("aria-pressed", String(erasing));
  hint.textContent = erasing ? "Erase mode: click a member or free joint." : "Click two joints to add a member.";
  draw();
});

document.getElementById("reset").addEventListener("click", () => {
  resetDesign();
  result.className = "result";
  result.textContent = "Canvas cleared. Create a new design or load the starter truss.";
  document.getElementById("reserve").textContent = "—";
  hint.textContent = "Click the grid to place a joint, then click two joints to connect them.";
});

document.getElementById("example").addEventListener("click", () => {
  resetDesign();
  const lower = [];
  for (let i = 1; i < deckCount - 1; i++) {
    lower.push(nodes.length);
    nodes.push({ x: left + i * step, y: deckY + 102, fixed: false });
  }
  function add(a, b) { members.push({ a, b, type: "steel" }); }
  add(0, lower[0]);
  add(deckCount - 1, lower[lower.length - 1]);
  for (let i = 0; i < lower.length; i++) {
    add(i + 1, lower[i]);
    add(i, lower[i]);
    if (i > 0) add(lower[i - 1], lower[i]);
  }
  add(deckCount - 2, lower[lower.length - 1]);
  changed();
  hint.textContent = "Starter truss loaded. Test it, or edit materials and members.";
});

testButton.addEventListener("click", () => {
  if (test) return;
  if (!members.length) {
    result.className = "result fail";
    result.textContent = "No structural members. Add members or load the starter truss.";
    return;
  }
  if (designCost() > budget) {
    result.className = "result fail";
    result.textContent = `Over budget by ${(designCost() - budget).toLocaleString()} credits. Reduce material before testing.`;
    return;
  }
  const reserves = evaluateDesign();
  const worst = Math.min(...reserves);
  document.getElementById("reserve").textContent = `${worst.toFixed(2)}×`;
  test = { start: performance.now(), reserves, failed: false, position: left };
  testButton.disabled = true;
  result.className = "result";
  result.textContent = "Vehicle test in progress…";
  animationFrame = requestAnimationFrame(animate);
});

function animate(now) {
  if (!test) return;
  const progress = Math.min(1, (now - test.start) / 4800);
  const index = Math.min(deckCount - 2, Math.max(1, Math.round(progress * (deckCount - 1))));
  test.position = left + progress * (right - left);
  if (test.reserves[index - 1] < 1) {
    const reserve = Math.min(...test.reserves);
    result.className = "result fail";
    result.textContent = `Bridge failed near ${Math.round(progress * 68)} m. Worst reserve ${reserve.toFixed(2)}×; add bracing or improve the support paths to both banks.`;
    test.failed = true;
    draw();
    test = null;
    testButton.disabled = false;
    animationFrame = null;
    return;
  }
  draw();
  if (progress < 1) {
    animationFrame = requestAnimationFrame(animate);
  } else {
    const reserve = Math.min(...test.reserves);
    const score = Math.round(1000 * (1 - designCost() / budget) * Math.min(1.5, reserve));
    if (bestScore === null || score > bestScore) bestScore = score;
    document.getElementById("best").textContent = bestScore.toLocaleString();
    result.className = "result success";
    result.textContent = `Crossing complete! Score ${score.toLocaleString()} · worst reserve ${reserve.toFixed(2)}× · cost ${designCost().toLocaleString()} / ${budget.toLocaleString()}. Try reducing cost without losing support.`;
    test = null;
    testButton.disabled = false;
    animationFrame = null;
    draw();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sky = ctx.createLinearGradient(0, 0, 0, 560);
  sky.addColorStop(0, "#142a35");
  sky.addColorStop(1, "#10212c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1000, 560);

  ctx.strokeStyle = "#ffffff0c";
  ctx.lineWidth = 1;
  for (let x = left; x <= right; x += 34) {
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, 440); ctx.stroke();
  }
  for (let y = 90; y <= 430; y += 34) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }

  ctx.fillStyle = "#1d444b";
  ctx.fillRect(0, 368, 1000, 192);
  ctx.fillStyle = "#1b3436";
  ctx.beginPath();
  ctx.moveTo(0, 290); ctx.lineTo(left - 14, 290); ctx.lineTo(left - 14, 560);
  ctx.lineTo(0, 560); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(right + 14, 290); ctx.lineTo(1000, 290); ctx.lineTo(1000, 560);
  ctx.lineTo(right + 14, 560); ctx.fill();
  ctx.strokeStyle = "#39808a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = left; x <= right; x += 8) {
    const y = 410 + Math.sin(x / 23) * 2.5;
    if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (const member of members) {
    const a = nodes[member.a];
    const b = nodes[member.b];
    const style = materials[member.type];
    ctx.strokeStyle = "#06131b";
    ctx.lineWidth = style.width + 4;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  ctx.lineCap = "round";
  ctx.strokeStyle = "#e0e8e2";
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(left, deckY); ctx.lineTo(right, deckY); ctx.stroke();
  ctx.strokeStyle = "#526669";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(left, deckY - 7); ctx.lineTo(right, deckY - 7); ctx.stroke();
  ctx.lineCap = "butt";

  nodes.forEach((node, index) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, index === selected ? 10 : node.fixed ? 6 : 7, 0, Math.PI * 2);
    ctx.fillStyle = index === selected ? "#fff1bc" : node.fixed ? "#9eb8b4" : "#e5b562";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#14232b";
    ctx.stroke();
  });
  for (const x of [left, right]) {
    ctx.fillStyle = "#e5b562";
    ctx.beginPath();
    ctx.moveTo(x, deckY + 10); ctx.lineTo(x - 14, deckY + 30);
    ctx.lineTo(x + 14, deckY + 30); ctx.fill();
  }

  if (test) {
    const x = test.position;
    const index = Math.min(deckCount - 2, Math.max(1, Math.round((x - left) / step)));
    const reserve = test.reserves[index - 1];
    const sag = Math.min(16, 3 / Math.max(0.2, reserve));
    ctx.fillStyle = test.failed ? "#ef8378" : "#e5b562";
    ctx.fillRect(x - 23, deckY - 35 + sag, 46, 24);
    ctx.fillStyle = "#17272e";
    ctx.fillRect(x - 14, deckY - 30 + sag, 13, 9);
    ctx.fillRect(x + 5, deckY - 30 + sag, 12, 9);
    ctx.fillStyle = "#dfe9e4";
    for (const offset of [-13, 13]) {
      ctx.beginPath(); ctx.arc(x + offset, deckY - 10 + sag, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.font = "11px Segoe UI, sans-serif";
  ctx.fillStyle = "#8ea7a6";
  ctx.fillText("WEST SUPPORT", 65, 330);
  ctx.fillText("EAST SUPPORT", 847, 330);
  ctx.fillText("68 m DESIGN SPAN", 439, 494);
  ctx.fillStyle = "#e5b562";
  ctx.fillRect(430, 467, 140, 1);
}

resetDesign();
