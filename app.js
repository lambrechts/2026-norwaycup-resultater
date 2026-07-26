const DATA_URL = "https://raw.githubusercontent.com/lambrechts/2026-norwaycup-resultater/refs/heads/main/data/results.csv";
const ARENA_MAPS = [
  ["rustad", "https://norwaycup.no/wp-content/uploads/2026/07/Rustad_2026.pdf"],
  ["valle hovin", "https://norwaycup.no/wp-content/uploads/2026/07/Endelig-skilt-2-banekart.png"],
  ["furuset", "https://norwaycup.no/wp-content/uploads/2026/07/Furuset_2026-1.pdf"],
  ["abildsø", "https://norwaycup.no/wp-content/uploads/2026/07/Abildso_2026.pdf"],
  ["tørteberg", "https://norwaycup.no/wp-content/uploads/2026/07/TortebergMarienlyst_2026.pdf"],
  ["marienlyst", "https://norwaycup.no/wp-content/uploads/2026/07/TortebergMarienlyst_2026.pdf"],
  ["voldsløkka", "https://norwaycup.no/wp-content/uploads/2026/07/Voldslokka_Bjolsen_2026.pdf"],
  ["bjølsen", "https://norwaycup.no/wp-content/uploads/2026/07/Voldslokka_Bjolsen_2026.pdf"],
  ["ekeberg", "https://norwaycup.no/wp-content/uploads/2026/07/Banekart-NC2026-2.pdf"],
];
const state = { matches: [], team: "all", status: "all" };

const elements = {
  matches: document.querySelector("#matches"),
  teams: document.querySelector("#team-buttons"),
  statuses: document.querySelector("#status-buttons"),
  next: document.querySelector("#next-match"),
  count: document.querySelector("#match-count"),
  update: document.querySelector("#update-status"),
  refresh: document.querySelector("#refresh-button"),
  template: document.querySelector("#match-template"),
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((item) => item.some(Boolean)).map((item) =>
    Object.fromEntries(headers.map((header, index) => [header, item[index] || ""]))
  );
}

function shortTeamName(name) {
  return name
    .replace(/^G16 /, "")
    .replace(/^J14 /, "")
    .replace(/^Varegg Fotball\s*/, "Varegg ")
    .replace(/^Sandviken, IL\s*/, "Sandviken ")
    .replace(/Sandviken\/Varegg\s*/, "")
    .replace(/\/Sandviken\s*/, "")
    .trim();
}

function teamButtonName(name) {
  const age = name.split(" ")[0];
  const color = name.split(" ").at(-1);
  return `${age} ${color}`;
}

function dateValue(match) { return new Date(match.start_time); }
function isUpcoming(match) { return match.status !== "finished"; }
function dayKey(match) { return match.start_time.slice(0, 10); }
function arenaMapUrl(arena) {
  const normalized = arena.toLocaleLowerCase("nb-NO");
  return ARENA_MAPS.find(([name]) => normalized.includes(name))?.[1] || "";
}

function arenaMarkup(arena) {
  const label = arena || "Bane ikke klar";
  const url = arenaMapUrl(label);
  return url
    ? `<a href="${url}" target="_blank" rel="noreferrer" title="Åpne banekart for ${escapeHtml(label)}">${escapeHtml(label)}<span aria-hidden="true"> ↗</span></a>`
    : escapeHtml(label);
}

const dayFormatter = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" });
const timeFormatter = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" });
const updatedFormatter = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" });

function renderTeamButtons() {
  const teams = [...new Map(state.matches.map((match) => [match.tracked_team_id, match.tracked_team_name])).entries()];
  elements.teams.replaceChildren();
  const options = [["all", "Alle lag"], ...teams.map(([id, name]) => [id, teamButtonName(name)])];
  options.forEach(([id, name]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-button${state.team === id ? " is-active" : ""}`;
    button.textContent = name;
    button.addEventListener("click", () => { state.team = id; render(); });
    elements.teams.append(button);
  });
}

function filteredMatches() {
  return state.matches.filter((match) => {
    const teamMatches = state.team === "all" || match.tracked_team_id === state.team;
    const statusMatches = state.status === "all" || (state.status === "upcoming" ? isUpcoming(match) : match.status === "finished");
    return teamMatches && statusMatches;
  });
}

function renderNextMatch() {
  const now = new Date();
  const candidates = state.matches
    .filter((match) => (state.team === "all" || match.tracked_team_id === state.team) && isUpcoming(match) && dateValue(match) >= now)
    .sort((a, b) => dateValue(a) - dateValue(b));
  const match = candidates[0];
  if (!match) { elements.next.replaceChildren(); return; }

  const card = document.createElement("div");
  card.className = "next-card";
  card.innerHTML = `
    <div><div class="next-card__label">Neste kamp</div><div class="next-card__date">${capitalize(dayFormatter.format(dateValue(match)))} · ${timeFormatter.format(dateValue(match))}</div></div>
    <div class="next-card__teams">${escapeHtml(shortTeamName(match.home_team))}<span>–</span>${escapeHtml(shortTeamName(match.away_team))}</div>
    <div class="next-card__arena">${arenaMarkup(match.arena)}</div>`;
  elements.next.replaceChildren(card);
}

function renderCard(match) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  if (match.status === "live") card.classList.add("is-live");
  card.querySelector("time").textContent = `Kl. ${timeFormatter.format(dateValue(match))}`;
  const pill = card.querySelector(".status-pill");
  pill.textContent = match.status === "finished" ? "Ferdig" : match.status === "live" ? "Live" : "Kommende";
  if (match.status === "live") pill.classList.add("is-live");

  const home = card.querySelector(".team--home");
  const away = card.querySelector(".team--away");
  home.querySelector(".team__name").textContent = shortTeamName(match.home_team);
  away.querySelector(".team__name").textContent = shortTeamName(match.away_team);
  home.querySelector(".team__score").textContent = match.home_goals;
  away.querySelector(".team__score").textContent = match.away_goals;
  if (match.winner === "home") home.classList.add("is-winner");
  if (match.winner === "away") away.classList.add("is-winner");
  card.querySelector(".arena").innerHTML = arenaMarkup(match.arena);
  card.querySelector(".group").textContent = match.group;
  return card;
}

function renderMatches() {
  const matches = filteredMatches().sort((a, b) => dateValue(a) - dateValue(b));
  elements.count.textContent = `${matches.length} ${matches.length === 1 ? "kamp" : "kamper"}`;
  elements.matches.replaceChildren();
  if (!matches.length) {
    elements.matches.innerHTML = '<div class="empty"><strong>Ingen kamper her</strong>Prøv et annet lag eller filter.</div>';
    return;
  }

  const groups = Map.groupBy ? Map.groupBy(matches, dayKey) : matches.reduce((map, match) => {
    const key = dayKey(match); if (!map.has(key)) map.set(key, []); map.get(key).push(match); return map;
  }, new Map());
  groups.forEach((dayMatches) => {
    const section = document.createElement("section");
    section.className = "day-group";
    const heading = document.createElement("h2");
    heading.className = "day-heading";
    heading.innerHTML = `${capitalize(dayFormatter.format(dateValue(dayMatches[0])))} <span>${dayMatches.length} ${dayMatches.length === 1 ? "kamp" : "kamper"}</span>`;
    const grid = document.createElement("div");
    grid.className = "day-grid";
    dayMatches.forEach((match) => grid.append(renderCard(match)));
    section.append(heading, grid);
    elements.matches.append(section);
  });
}

function render() {
  renderTeamButtons();
  renderNextMatch();
  renderMatches();
}

function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }

async function loadData() {
  elements.refresh.classList.add("is-loading");
  try {
    let response;
    try {
      response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (remoteError) {
      console.warn("Bruker lokal CSV som reserve", remoteError);
      response = await fetch(`data/results.csv?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw remoteError;
    }
    state.matches = parseCsv(await response.text());
    elements.update.textContent = `Sist sjekket kl. ${updatedFormatter.format(new Date())}`;
    render();
  } catch (error) {
    console.error(error);
    elements.update.textContent = "Kunne ikke hente resultater";
    elements.matches.innerHTML = '<div class="error"><strong>Noe gikk galt</strong>Resultatene kunne ikke lastes. Prøv igjen om litt.</div>';
  } finally {
    elements.refresh.classList.remove("is-loading");
  }
}

elements.statuses.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-status]");
  if (!button) return;
  state.status = button.dataset.status;
  elements.statuses.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  renderMatches();
});
elements.refresh.addEventListener("click", loadData);
loadData();
