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
  favoritesDialog: document.querySelector("#favorites-dialog"),
  favoriteOptions: document.querySelector("#favorite-options"),
  statuses: document.querySelector("#status-buttons"),
  next: document.querySelector("#next-match"),
  count: document.querySelector("#match-count"),
  currentMatches: document.querySelector("#current-matches-button"),
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

function normalizeMatch(match) {
  const hasOfficialName = Boolean(match.tracked_team_class);
  const trackedClass = match.tracked_team_class || match.tracked_team_name.split(" ")[0];
  let officialName = match.tracked_team_name;
  if (!hasOfficialName && match.tracked_team_id === match.home_team_id && match.home_team) officialName = match.home_team;
  if (!hasOfficialName && match.tracked_team_id === match.away_team_id && match.away_team) officialName = match.away_team;
  return { ...match, tracked_team_name: officialName, tracked_team_class: trackedClass };
}

function shortTeamName(name) {
  const shortened = name
    .replace(/^G16 /, "")
    .replace(/^J14 /, "")
    .replace(/^Varegg Fotball\s*/, "Varegg ")
    .replace(/^Sandviken, IL\s*/, "Sandviken ")
    .replace(/^Sandviken\s+Sandviken\//, "Sandviken/")
    .replace(/\/Sandviken\s*/, "")
    .trim();
  return shortened || name;
}

function teamButtonName(name, className) {
  return name.toLowerCase().startsWith(className.toLowerCase()) ? name : `${className} · ${name}`;
}

function teamClassName(match) {
  return match.tracked_team_class || match.tracked_team_name.split(" ")[0];
}

function dateValue(match) { return new Date(match.start_time); }
function isUpcoming(match) { return match.status !== "finished"; }
function dayKey(match) { return match.start_time.slice(0, 10); }
function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
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
  return [...new Map(state.matches.map((match) => [match.tracked_team_id, {
    name: match.tracked_team_name,
    className: match.tracked_team_class || match.tracked_team_name.split(" ")[0],
  }])).entries()].sort((a, b) => compareTeams(a[1], b[1]));
}

function teamGender(team) { return team.className.startsWith("J") ? 0 : 1; }
function teamAge(team) { return Number.parseInt(team.className.match(/\d+/)?.[0] || "99", 10); }
function compareTeams(a, b) {
  return teamGender(a) - teamGender(b)
    || teamAge(a) - teamAge(b)
    || a.className.localeCompare(b.className, "nb", { numeric: true })
    || a.name.localeCompare(b.name, "nb", { numeric: true });
}

function cohort(match) { return match.tracked_team_class || match.tracked_team_name.split(" ")[0]; }

function renderViewSelect() {
  const teams = teamEntries();
  const cohorts = [...new Set(teams.map(([, team]) => team.className))].sort((a, b) => compareTeams({ className: a, name: a }, { className: b, name: b }));
  elements.view.replaceChildren();

  const overview = document.createElement("optgroup");
  overview.label = "Oversikt";
  overview.append(new Option("Alle lag", "all"), new Option(`Favoritter (${state.favorites.size})`, "favorites"));
  const cohortGroup = document.createElement("optgroup");
  cohortGroup.label = "Årskull";
  cohorts.forEach((name) => cohortGroup.append(new Option(name, `cohort:${name}`)));
  const teamGroup = document.createElement("optgroup");
  teamGroup.label = "Enkeltlag";
  teams.forEach(([id, team]) => teamGroup.append(new Option(teamButtonName(team.name, team.className), `team:${id}`)));
  elements.view.append(overview, cohortGroup, teamGroup);
  elements.view.value = state.view;

  elements.favorite.textContent = `★ Velg favoritter${state.favorites.size ? ` (${state.favorites.size})` : ""}`;
}

function renderFavoriteOptions() {
  elements.favoriteOptions.replaceChildren();
  const teams = teamEntries();
  const columns = [
    ["Jentelag", teams.filter(([, team]) => team.className.startsWith("J"))],
    ["Guttelag", teams.filter(([, team]) => team.className.startsWith("G"))],
  ];
  columns.forEach(([heading, columnTeams]) => {
    const column = document.createElement("section");
    column.className = "favorite-column";
    const title = document.createElement("h3");
    title.textContent = heading;
    const list = document.createElement("div");
    list.className = "favorite-column__list";
    columnTeams.sort((a, b) => compareTeams(a[1], b[1])).forEach(([id, team]) => {
      const label = document.createElement("label");
      label.className = "favorite-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.favorites.has(id);
      input.addEventListener("change", () => {
        if (input.checked) state.favorites.add(id);
        else state.favorites.delete(id);
        saveFavorites();
      });
      const name = document.createElement("span");
      name.textContent = teamButtonName(team.name, team.className);
      label.append(input, name);
      list.append(label);
    });
    column.append(title, list);
    elements.favoriteOptions.append(column);
  });
}

function matchesView(match) {
  if (state.view === "all") return true;
  if (state.view === "favorites") return state.favorites.has(match.tracked_team_id);
  if (state.view.startsWith("cohort:")) return cohort(match) === state.view.slice(7);
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
  if (isUpcoming(match)) card.classList.add("is-upcoming");
  else card.classList.add("is-finished");
  card.querySelector("time").textContent = `Kl. ${timeFormatter.format(dateValue(match))}`;
  card.querySelector(".class-pill").textContent = teamClassName(match);
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
  elements.currentMatches.hidden = !matches.some(isUpcoming);
  elements.matches.replaceChildren();
  if (!matches.length) {
    elements.matches.innerHTML = state.view === "favorites" && state.favorites.size === 0
      ? '<div class="empty"><strong>Ingen favoritter ennå</strong>Trykk på «★ Velg favoritter» og kryss av lagene du vil følge.</div>'
      : '<div class="empty"><strong>Ingen kamper her</strong>Prøv et annet lag eller filter.</div>';
    return;
  }

  const groups = Map.groupBy ? Map.groupBy(matches, dayKey) : matches.reduce((map, match) => {
    const key = dayKey(match); if (!map.has(key)) map.set(key, []); map.get(key).push(match); return map;
  }, new Map());
  const today = localDayKey(new Date());
  groups.forEach((dayMatches, date) => {
    const completedPastDay = date < today && dayMatches.every((match) => match.status === "finished");
    const section = document.createElement(completedPastDay ? "details" : "section");
    section.className = `day-group${completedPastDay ? " day-group--finished" : ""}`;
    const heading = document.createElement("h2");
    heading.className = "day-heading";
    heading.innerHTML = `${capitalize(dayFormatter.format(dateValue(dayMatches[0])))} <span>${dayMatches.length} ${dayMatches.length === 1 ? "kamp" : "kamper"}</span>`;
    const headingWrapper = completedPastDay ? document.createElement("summary") : heading;
    if (completedPastDay) headingWrapper.append(heading);
    const grid = document.createElement("div");
    grid.className = "day-grid";
    dayMatches.forEach((match) => grid.append(renderCard(match)));
    section.append(headingWrapper, grid);
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
    state.matches = parseCsv(await response.text()).map(normalizeMatch);
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
  renderFavoriteOptions();
  elements.favoritesDialog.showModal();
});
elements.favoritesDialog.addEventListener("close", render);
elements.refresh.addEventListener("click", loadData);
elements.currentMatches.addEventListener("click", () => {
  if (state.status === "finished") {
    state.status = "all";
    elements.statuses.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.status === "all"));
    renderMatches();
  }
  requestAnimationFrame(() => document.querySelector(".match-card.is-upcoming")?.scrollIntoView({ behavior: "smooth", block: "center" }));
});
loadData();
