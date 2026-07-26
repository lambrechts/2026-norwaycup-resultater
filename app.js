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
const FAVORITES_KEY = "norwaycup-favorite-teams";
const state = { matches: [], view: "all", status: "all", favorites: loadFavorites() };

const elements = {
  matches: document.querySelector("#matches"),
  view: document.querySelector("#view-select"),
  favorite: document.querySelector("#favorite-button"),
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

function teamClassName(name) {
  const parts = name.split(" ");
  const detail = parts.find((part) => part.toLowerCase().includes("7-er"))
    || (/^\d+$/.test(parts.at(-1)) ? parts.at(-1) : "")
    || (["gul", "blå", "hvit", "rød"].includes(parts.at(-1).toLowerCase()) ? parts.at(-1) : "");
  return detail ? `${parts[0]} · ${detail}` : parts[0];
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

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]").map(String)); }
  catch { return new Set(); }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
}

function teamEntries() {
  return [...new Map(state.matches.map((match) => [match.tracked_team_id, match.tracked_team_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "nb"));
}

function cohort(name) { return name.split(" ")[0]; }
function selectedTeamId() { return state.view.startsWith("team:") ? state.view.slice(5) : ""; }

function renderViewSelect() {
  const teams = teamEntries();
  const cohorts = [...new Set(teams.map(([, name]) => cohort(name)))].sort((a, b) => a.localeCompare(b, "nb", { numeric: true }));
  elements.view.replaceChildren();

  const overview = document.createElement("optgroup");
  overview.label = "Oversikt";
  overview.append(new Option("Alle lag", "all"), new Option(`Favoritter (${state.favorites.size})`, "favorites"));
  const cohortGroup = document.createElement("optgroup");
  cohortGroup.label = "Årskull";
  cohorts.forEach((name) => cohortGroup.append(new Option(name, `cohort:${name}`)));
  const teamGroup = document.createElement("optgroup");
  teamGroup.label = "Enkeltlag";
  teams.forEach(([id, name]) => teamGroup.append(new Option(teamButtonName(name), `team:${id}`)));
  elements.view.append(overview, cohortGroup, teamGroup);
  elements.view.value = state.view;

  const teamId = selectedTeamId();
  elements.favorite.hidden = !teamId;
  if (teamId) {
    const favorite = state.favorites.has(teamId);
    elements.favorite.textContent = favorite ? "★ Favoritt" : "☆ Favoritt";
    elements.favorite.classList.toggle("is-favorite", favorite);
    elements.favorite.setAttribute("aria-pressed", String(favorite));
  }
}

function matchesView(match) {
  if (state.view === "all") return true;
  if (state.view === "favorites") return state.favorites.has(match.tracked_team_id);
  if (state.view.startsWith("cohort:")) return cohort(match.tracked_team_name) === state.view.slice(7);
  if (state.view.startsWith("team:")) return match.tracked_team_id === state.view.slice(5);
  return true;
}

function filteredMatches() {
  return state.matches.filter((match) => {
    const teamMatches = matchesView(match);
    const statusMatches = state.status === "all" || (state.status === "upcoming" ? isUpcoming(match) : match.status === "finished");
    return teamMatches && statusMatches;
  });
}

function renderNextMatch() {
  const now = new Date();
  const candidates = state.matches
    .filter((match) => matchesView(match) && isUpcoming(match) && dateValue(match) >= now)
    .sort((a, b) => dateValue(a) - dateValue(b));
  const match = candidates[0];
  if (!match) { elements.next.replaceChildren(); return; }

  const card = document.createElement("div");
  card.className = "next-card";
  card.innerHTML = `
    <div><div class="next-card__label">Neste kamp</div><div class="next-card__date">${capitalize(dayFormatter.format(dateValue(match)))} · ${timeFormatter.format(dateValue(match))}</div></div>
    <div class="next-card__teams">${teamLinkMarkup(match.home_team, match.home_team_id)}<span>–</span>${teamLinkMarkup(match.away_team, match.away_team_id)}</div>
    <div class="next-card__arena">${arenaMarkup(match.arena)}</div>`;
  elements.next.replaceChildren(card);
}

function renderCard(match) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  if (match.status === "live") card.classList.add("is-live");
  card.querySelector("time").textContent = `Kl. ${timeFormatter.format(dateValue(match))}`;
  card.querySelector(".class-pill").textContent = teamClassName(match.tracked_team_name);
  const pill = card.querySelector(".status-pill");
  pill.textContent = match.status === "finished" ? "Ferdig" : match.status === "live" ? "Live" : "Kommende";
  if (match.status === "live") pill.classList.add("is-live");

  const home = card.querySelector(".team--home");
  const away = card.querySelector(".team--away");
  const homeLink = home.querySelector(".team__name");
  const awayLink = away.querySelector(".team__name");
  homeLink.textContent = shortTeamName(match.home_team);
  awayLink.textContent = shortTeamName(match.away_team);
  setTeamLink(homeLink, match.home_team_id);
  setTeamLink(awayLink, match.away_team_id);
  home.querySelector(".team__score").textContent = match.home_goals;
  away.querySelector(".team__score").textContent = match.away_goals;
  if (match.winner === "home") home.classList.add("is-winner");
  if (match.winner === "away") away.classList.add("is-winner");
  card.querySelector(".arena").innerHTML = arenaMarkup(match.arena);
  card.querySelector(".group").textContent = match.group;
  card.querySelector(".match-link").href = norwayCupUrl("match", match.match_id);
  return card;
}

function renderMatches() {
  const matches = filteredMatches().sort((a, b) => dateValue(a) - dateValue(b));
  elements.count.textContent = `${matches.length} ${matches.length === 1 ? "kamp" : "kamper"}`;
  elements.matches.replaceChildren();
  if (!matches.length) {
    elements.matches.innerHTML = state.view === "favorites" && state.favorites.size === 0
      ? '<div class="empty"><strong>Ingen favoritter ennå</strong>Velg et enkeltlag over og trykk på «☆ Favoritt».</div>'
      : '<div class="empty"><strong>Ingen kamper her</strong>Prøv et annet lag eller filter.</div>';
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
  renderViewSelect();
  renderNextMatch();
  renderMatches();
}

function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }
function norwayCupUrl(type, id) { return `https://norwaycup.cupmanager.net/2026,nb/result/${type}/${id}`; }
function setTeamLink(link, id) {
  if (id) link.href = norwayCupUrl("team", id);
  else { link.removeAttribute("href"); link.removeAttribute("target"); }
}
function teamLinkMarkup(name, id) {
  const label = escapeHtml(shortTeamName(name));
  return id ? `<a href="${norwayCupUrl("team", id)}" target="_blank" rel="noreferrer">${label}</a>` : label;
}

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
elements.view.addEventListener("change", () => { state.view = elements.view.value; render(); });
elements.favorite.addEventListener("click", () => {
  const teamId = selectedTeamId();
  if (!teamId) return;
  if (state.favorites.has(teamId)) state.favorites.delete(teamId);
  else state.favorites.add(teamId);
  saveFavorites();
  render();
});
elements.refresh.addEventListener("click", loadData);
loadData();
