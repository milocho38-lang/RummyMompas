const OLD_DEFAULT_PLAYERS = ["Camilo", "Juan", "Andrés", "Pedro", "Mauricio"];
const DEFAULT_PLAYERS = [
  "Kike",
  "Indio",
  "Mono",
  "Caliche",
  "Cuervo",
  "Willie",
  "Nash",
  "Camish",
  "Fish",
  "Reina",
];
const STORAGE_KEY = "rummy-mompas-game-v1";
const HISTORY_KEY = "rummy-mompas-history-v1";
const PLAYERS_KEY = "rummy-mompas-players-v1";
const LEGACY_PLAYERS_KEYS = ["rummy-mompas-players", "rummy-mompas-regular-players-v1"];

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let screen = "home";
let game = loadGame();
let history = loadHistory();
let regularPlayers = loadRegularPlayers();
let selectedHistoryId = null;
let roundDraft = null;
let toastTimer = null;

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function loadGame() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function loadHistory() {
  try {
    const savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(savedHistory) ? savedHistory : [];
  } catch {
    return [];
  }
}

function loadRegularPlayers() {
  try {
    const storedValue =
      localStorage.getItem(PLAYERS_KEY) ||
      LEGACY_PLAYERS_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    const savedPlayers = JSON.parse(storedValue);
    if (Array.isArray(savedPlayers) && savedPlayers.every((player) => typeof player === "string")) {
      const cleanPlayers = savedPlayers
        .map((player) => player.trim())
        .filter(
          (player, index, players) =>
            player &&
            players.findIndex(
              (candidate) =>
                candidate.toLocaleLowerCase("es") === player.toLocaleLowerCase("es"),
            ) === index,
        );
      const isOldDefault =
        cleanPlayers.length === OLD_DEFAULT_PLAYERS.length &&
        OLD_DEFAULT_PLAYERS.every((player) => cleanPlayers.includes(player));
      if (!isOldDefault) {
        localStorage.setItem(PLAYERS_KEY, JSON.stringify(cleanPlayers));
        return cleanPlayers;
      }
    }
  } catch {
    // Usa la nueva lista predeterminada si el dato guardado está dañado.
  }

  const migratedPlayers = [...DEFAULT_PLAYERS];
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(migratedPlayers));
  return migratedPlayers;
}

function saveGame() {
  if (game) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function saveRegularPlayers() {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(regularPlayers));
}

function cloneGame(savedGame) {
  return JSON.parse(JSON.stringify(savedGame));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeGameName(savedGame, index = 0) {
  if (savedGame.name) return savedGame.name;
  const date = new Date(savedGame.finishedAt || savedGame.createdAt || Date.now());
  const dateLabel = Number.isNaN(date.getTime())
    ? `${index + 1}`
    : date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `Partida ${dateLabel}`;
}

function migrateFinishedGame() {
  if (!game?.finished) return;
  const alreadySaved = history.some((savedGame) => savedGame.id === game.id);
  if (!alreadySaved) {
    game.name = normalizeGameName(game, history.length);
    game.finishedAt = game.finishedAt || game.createdAt || new Date().toISOString();
    history.unshift(cloneGame(game));
    saveHistory();
    saveGame();
  }
}

migrateFinishedGame();

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatMoney(value) {
  return money.format(Math.round(value)).replace(/\u00a0/g, " ");
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function roundMompas(value) {
  return Math.round(value / 1000) * 1000;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fitCanvasText(context, text, maxWidth) {
  const value = String(text);
  if (context.measureText(value).width <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function createResultCanvas(resultGame) {
  const { totals, balances, payments } = calculateSettlement(resultGame);
  const positions = resultGame.players
    .map((player) => ({
      player,
      wins: totals[player].wins,
      points: totals[player].points,
      balance: balances[player],
    }))
    .sort((a, b) => b.balance - a.balance || b.wins - a.wins || a.points - b.points);

  const winner = positions[0];
  const width = 1080;
  const positionRowHeight = 82;
  const paymentRowHeight = 94;
  const paymentsHeight = Math.max(118, payments.length * paymentRowHeight + 36);
  const height = 830 + positions.length * positionRowHeight + paymentsHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  const colors = {
    background: "#062b24",
    backgroundLight: "#0b4135",
    card: "#0a352d",
    gold: "#d6aa45",
    goldLight: "#f2cf76",
    white: "#fff8e7",
    muted: "#b9c9c2",
    line: "rgba(255,255,255,0.13)",
    positive: "#87dfad",
    negative: "#ffa79f",
  };

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors.backgroundLight);
  gradient.addColorStop(0.72, colors.background);
  gradient.addColorStop(1, "#041d19");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.08;
  context.strokeStyle = colors.goldLight;
  context.lineWidth = 2;
  for (let x = -height; x < width + height; x += 70) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + height, height);
    context.stroke();
  }
  context.globalAlpha = 1;

  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillStyle = colors.white;
  context.font = '700 72px Georgia, "Times New Roman", serif';
  context.fillText("🃏💵", width / 2, 88);

  context.fillStyle = colors.goldLight;
  context.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText("RUMMY MOMPAS · RESULTADO FINAL", width / 2, 154);

  context.fillStyle = colors.white;
  context.font = '800 54px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(
    fitCanvasText(context, normalizeGameName(resultGame), width - 130),
    width / 2,
    218,
  );

  context.fillStyle = colors.muted;
  context.font = '500 27px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(
    `${formatDate(resultGame.finishedAt || resultGame.createdAt)} · ${resultGame.rounds.length} rondas`,
    width / 2,
    268,
  );

  roundedRect(context, 70, 310, width - 140, 142, 30);
  context.fillStyle = "rgba(214,170,69,0.13)";
  context.fill();
  context.strokeStyle = "rgba(242,207,118,0.5)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = colors.goldLight;
  context.font = '800 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText("GANADOR", width / 2, 344);
  context.fillStyle = colors.white;
  context.font = '900 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(`🏆 ${winner.player}`, width / 2, 392);
  context.fillStyle = colors.positive;
  context.font = '800 25px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(
    `${winner.balance >= 0 ? "+" : ""}${formatMoney(roundMompas(winner.balance))} Mompas`,
    width / 2,
    430,
  );

  let y = 510;
  context.textAlign = "left";
  context.fillStyle = colors.goldLight;
  context.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText("TABLA DE POSICIONES", 70, y);
  y += 48;

  roundedRect(context, 70, y, width - 140, 58, 16);
  context.fillStyle = "rgba(0,0,0,0.17)";
  context.fill();
  context.fillStyle = colors.muted;
  context.font = '700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText("#", 92, y + 29);
  context.fillText("JUGADOR", 145, y + 29);
  context.textAlign = "center";
  context.fillText("GANADAS", 610, y + 29);
  context.fillText("PUNTOS", 760, y + 29);
  context.textAlign = "right";
  context.fillText("SALDO", 985, y + 29);
  y += 58;

  positions.forEach((position, index) => {
    const rowY = y + index * positionRowHeight;
    context.strokeStyle = colors.line;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(70, rowY + positionRowHeight);
    context.lineTo(width - 70, rowY + positionRowHeight);
    context.stroke();

    context.textAlign = "left";
    context.fillStyle = index === 0 ? colors.goldLight : colors.white;
    context.font = '800 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText(`${index + 1}`, 92, rowY + 40);
    context.fillText(fitCanvasText(context, position.player, 360), 145, rowY + 40);

    context.textAlign = "center";
    context.fillStyle = colors.white;
    context.font = '700 25px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText(String(position.wins), 610, rowY + 40);
    context.fillText(formatNumber(position.points), 760, rowY + 40);

    context.textAlign = "right";
    context.fillStyle = position.balance >= 0 ? colors.positive : colors.negative;
    context.font = '800 25px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const roundedBalance = roundMompas(position.balance);
    context.fillText(
      `${roundedBalance > 0 ? "+" : ""}${formatMoney(roundedBalance)}`,
      985,
      rowY + 40,
    );
  });

  y += positions.length * positionRowHeight + 62;
  context.textAlign = "left";
  context.fillStyle = colors.goldLight;
  context.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText("LIQUIDACIÓN FINAL · VALORES MOMPAS", 70, y);
  y += 42;

  roundedRect(context, 70, y, width - 140, paymentsHeight, 28);
  context.fillStyle = colors.card;
  context.fill();
  context.strokeStyle = "rgba(214,170,69,0.32)";
  context.lineWidth = 2;
  context.stroke();

  if (!payments.length) {
    context.textAlign = "center";
    context.fillStyle = colors.muted;
    context.font = '600 27px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText("Mesa empatada · No hay pagos pendientes", width / 2, y + 59);
  } else {
    payments.forEach((payment, index) => {
      const rowY = y + 18 + index * paymentRowHeight;
      if (index > 0) {
        context.strokeStyle = colors.line;
        context.beginPath();
        context.moveTo(100, rowY);
        context.lineTo(width - 100, rowY);
        context.stroke();
      }
      context.textAlign = "left";
      context.fillStyle = colors.white;
      context.font = '800 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      context.fillText(
        fitCanvasText(context, `${payment.from}  →  ${payment.to}`, 570),
        105,
        rowY + 45,
      );
      context.textAlign = "right";
      context.fillStyle = colors.goldLight;
      context.font = '900 31px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      context.fillText(formatMoney(payment.rounded), width - 105, rowY + 45);
    });
  }

  context.textAlign = "center";
  context.fillStyle = colors.muted;
  context.font = '600 21px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(
    "Redondeo Mompas · al múltiplo de $1.000 más cercano",
    width / 2,
    height - 54,
  );

  return canvas;
}

function canvasToPngBlob(canvas) {
  const dataUrl = canvas.toDataURL("image/png");
  const [metadata, content] = dataUrl.split(",");
  const mimeType = metadata.match(/data:(.*?);/)?.[1] || "image/png";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function resultFileName(resultGame) {
  const cleanName = normalizeGameName(resultGame)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `rummy-mompas-${cleanName || resultGame.id}.png`;
}

function downloadResultImage(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareResult(button) {
  const resultGame = getSelectedFinishedGame();
  if (!resultGame) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando imagen…";

  try {
    const canvas = createResultCanvas(resultGame);
    const blob = canvasToPngBlob(canvas);
    const fileName = resultFileName(resultGame);
    const file =
      typeof File === "function" ? new File([blob], fileName, { type: "image/png" }) : null;
    let canShareFile = false;
    if (file && navigator.share && navigator.canShare) {
      try {
        canShareFile = navigator.canShare({ files: [file] });
      } catch {
        canShareFile = false;
      }
    }

    if (canShareFile) {
      try {
        await navigator.share({
          title: normalizeGameName(resultGame),
          text: `Resultado de ${normalizeGameName(resultGame)} · Rummy Mompas`,
          files: [file],
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          downloadResultImage(blob, fileName);
          showToast("No se pudo compartir. La imagen fue descargada.");
        }
      }
    } else {
      downloadResultImage(blob, fileName);
      showToast("Imagen PNG descargada.");
    }
  } catch {
    showToast("No fue posible generar la imagen.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function goTo(nextScreen) {
  screen = nextScreen;
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function topbar(title, subtitle, backTarget = "home") {
  return `
    <header class="topbar">
      <button class="icon-button" type="button" data-action="back" data-target="${backTarget}" aria-label="Volver">←</button>
      <div class="topbar-copy">
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
    </header>
  `;
}

function renderHome() {
  const hasActiveGame = Boolean(game && !game.finished);
  const hasFinishedGame = history.length > 0;
  return `
    <section class="screen home-screen">
      <div class="home-hero">
        <div class="logo-mark" aria-hidden="true">🃏💵</div>
        <p class="eyebrow">La mesa está servida</p>
        <h1>Rummy<br />Mompas</h1>
        <p class="subtitle">Puntos claros, cuentas justas y una sola pregunta: ¿quién paga?</p>
      </div>
      <div class="home-actions">
        ${
          hasActiveGame
            ? `<button class="btn btn-primary" type="button" data-action="continue-game">Continuar partida · ${game.rounds.length} rondas</button>`
            : ""
        }
        ${
          hasFinishedGame
            ? `<button class="btn btn-primary" type="button" data-action="view-latest-results">Última liquidación</button>`
            : ""
        }
        <button class="btn ${hasActiveGame || hasFinishedGame ? "btn-secondary" : "btn-primary"}" type="button" data-action="new-game">
          ${hasActiveGame ? "Crear otra partida" : "Crear partida"}
        </button>
        <button class="btn btn-secondary" type="button" data-action="view-history">
          Historial ${history.length ? `· ${history.length}` : ""}
        </button>
        <button class="btn btn-secondary" type="button" data-action="view-settings">
          Configuración
        </button>
      </div>
    </section>
  `;
}

function renderCreateGame() {
  return `
    <section class="screen">
      ${topbar("Nueva partida", "Arma la mesa y define las apuestas")}

      <form id="create-game-form">
        <div class="card">
          <span class="section-label">Partida</span>
          <div class="field">
            <label for="game-name">Nombre</label>
            <input
              class="text-input"
              id="game-name"
              name="gameName"
              type="text"
              maxlength="40"
              value="${escapeHtml(`Rummy ${formatDate(new Date().toISOString())}`)}"
              required
            />
          </div>
        </div>

        <div class="card">
          <span class="section-label">Jugadores</span>
          <p class="helper">Selecciona mínimo 2 jugadores.</p>
          <div class="player-picker">
            ${regularPlayers.map(
              (player) => `
                <label class="player-option">
                  <input type="checkbox" name="players" value="${escapeHtml(player)}" checked />
                  <span class="checkmark">✓</span>
                  <span class="player-avatar">${initials(player)}</span>
                  <span class="player-name">${escapeHtml(player)}</span>
                </label>
              `,
            ).join("")}
          </div>
        </div>

        <div class="card">
          <span class="section-label">Valores</span>
          <div class="money-grid">
            <div class="field">
              <label for="round-value">Por ronda</label>
              <div class="money-input-wrap">
                <span>$</span>
                <input class="money-input" id="round-value" name="roundValue" type="number" inputmode="numeric" min="0" step="100" value="5000" required />
              </div>
            </div>
            <div class="field">
              <label for="point-value">Por punto</label>
              <div class="money-input-wrap">
                <span>$</span>
                <input class="money-input" id="point-value" name="pointValue" type="number" inputmode="numeric" min="0" step="10" value="100" required />
              </div>
            </div>
          </div>
        </div>

        <div class="sticky-action">
          <button class="btn btn-primary" type="submit">Crear partida</button>
        </div>
      </form>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="screen">
      ${topbar("Configuración", "Administra los jugadores de cada nueva mesa")}

      <div class="card">
        <span class="section-label">Jugadores habituales</span>
        <p class="helper">Los cambios se usarán al crear la próxima partida.</p>

        ${
          regularPlayers.length
            ? `
              <form id="regular-players-form" class="settings-player-list">
                ${regularPlayers
                  .map(
                    (player, index) => `
                      <div class="settings-player-row">
                        <span class="player-avatar">${initials(player)}</span>
                        <input
                          class="text-input settings-player-input"
                          name="regularPlayer"
                          type="text"
                          maxlength="30"
                          value="${escapeHtml(player)}"
                          aria-label="Nombre de ${escapeHtml(player)}"
                          required
                        />
                        <button
                          class="settings-delete"
                          type="button"
                          data-action="delete-regular-player"
                          data-player-index="${index}"
                          aria-label="Eliminar ${escapeHtml(player)}"
                        >×</button>
                      </div>
                    `,
                  )
                  .join("")}
                <button class="btn btn-secondary" type="submit">Guardar cambios</button>
              </form>
            `
            : `<div class="empty-state">No hay jugadores habituales configurados.</div>`
        }
      </div>

      <form id="add-player-form" class="card">
        <span class="section-label">Agregar jugador</span>
        <div class="settings-add-row">
          <input
            class="text-input"
            name="playerName"
            type="text"
            maxlength="30"
            placeholder="Nombre"
            aria-label="Nombre del nuevo jugador"
            required
          />
          <button class="btn btn-primary settings-add-button" type="submit">Agregar</button>
        </div>
      </form>
    </section>
  `;
}

function getTotals(targetGame = game) {
  const totals = Object.fromEntries(
    targetGame.players.map((player) => [player, { points: 0, wins: 0 }]),
  );

  targetGame.rounds.forEach((round) => {
    totals[round.winner].wins += 1;
    targetGame.players.forEach((player) => {
      totals[player].points += Number(round.points[player]) || 0;
    });
  });

  return totals;
}

function renderGame() {
  const totals = getTotals();

  return `
    <section class="screen">
      ${topbar("Partida en curso", `${game.players.length} jugadores · ${game.rounds.length} rondas`)}

      <div class="game-meta">
        <span>Ronda <strong>${game.rounds.length + 1}</strong></span>
        <span>Ronda <strong>${formatMoney(game.roundValue)}</strong></span>
        <span>Punto <strong>${formatMoney(game.pointValue)}</strong></span>
      </div>

      <div class="card">
        <span class="section-label">Marcador</span>
        <table class="score-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Ganadas</th>
              <th>Puntos</th>
            </tr>
          </thead>
          <tbody>
            ${game.players
              .map(
                (player) => `
                  <tr>
                    <td>
                      <span class="score-player">
                        <span class="mini-avatar">${initials(player)}</span>
                        ${escapeHtml(player)}
                      </span>
                    </td>
                    <td class="wins-value">${totals[player].wins}</td>
                    <td class="points-value">${formatNumber(totals[player].points)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      ${
        game.rounds.length
          ? `
            <details class="card">
              <summary>Historial de rondas</summary>
              <div class="details-content round-history">
                ${[...game.rounds]
                  .reverse()
                  .map(
                    (round, index) => `
                      <div class="round-row">
                        <div>
                          <div class="round-label">Ronda ${game.rounds.length - index}</div>
                          <div class="round-winner">🏆 ${escapeHtml(round.winner)}</div>
                        </div>
                        <div class="round-label">${game.players
                          .filter((player) => player !== round.winner)
                          .map((player) => `${escapeHtml(player)} ${round.points[player]}`)
                          .join(" · ")}</div>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </details>
          `
          : `<div class="card empty-state">Todavía no hay rondas. El mazo espera.</div>`
      }

      <div class="game-actions">
        <button class="btn btn-primary" type="button" data-action="register-round">Registrar ronda</button>
        <button class="btn btn-danger" type="button" data-action="finish-game" ${game.rounds.length ? "" : "disabled"}>
          Finalizar partida
        </button>
      </div>
    </section>
  `;
}

function renderRound() {
  if (!roundDraft) {
    roundDraft = {
      winner: null,
      points: Object.fromEntries(game.players.map((player) => [player, ""])),
    };
  }

  return `
    <section class="screen">
      ${topbar(`Ronda ${game.rounds.length + 1}`, "Elige quién ganó y anota los puntos", "game")}

      <div class="card">
        <span class="section-label">Ganador</span>
        <div class="winner-grid">
          ${game.players
            .map(
              (player, index) => `
                <button
                  class="winner-option ${roundDraft.winner === player ? "selected" : ""}"
                  type="button"
                  data-action="select-winner"
                  data-player-index="${index}"
                >
                  ${roundDraft.winner === player ? "🏆 " : ""}${escapeHtml(player)}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>

      <form id="round-form">
        <div class="card">
          <span class="section-label">Puntos de la ronda</span>
          <p class="helper">El ganador queda en 0. Ingresa los puntos de los demás.</p>
          <div class="points-form">
            ${game.players
              .map((player, index) => {
                const isWinner = roundDraft.winner === player;
                return `
                  <div class="points-entry">
                    <label for="points-${index}">
                      ${escapeHtml(player)}
                      ${isWinner ? `<div class="winner-zero">Ganador</div>` : ""}
                    </label>
                    <input
                      id="points-${index}"
                      name="points-${index}"
                      data-player-index="${index}"
                      type="number"
                      inputmode="numeric"
                      min="0"
                      step="1"
                      placeholder="0"
                      value="${isWinner ? "0" : roundDraft.points[player]}"
                      ${isWinner ? "disabled" : ""}
                      ${roundDraft.winner && !isWinner ? "required" : ""}
                      aria-label="Puntos de ${escapeHtml(player)}"
                    />
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>

        <div class="sticky-action">
          <button class="btn btn-primary" type="submit">Guardar ronda</button>
        </div>
      </form>
    </section>
  `;
}

function calculateSettlement(targetGame = game) {
  const totals = getTotals(targetGame);
  const balances = Object.fromEntries(targetGame.players.map((player) => [player, 0]));
  const audit = [];

  for (let i = 0; i < targetGame.players.length; i += 1) {
    for (let j = i + 1; j < targetGame.players.length; j += 1) {
      const playerA = targetGame.players[i];
      const playerB = targetGame.players[j];
      const roundsAmount =
        (totals[playerA].wins - totals[playerB].wins) * targetGame.roundValue;
      const pointsAmount =
        (totals[playerB].points - totals[playerA].points) * targetGame.pointValue;
      const netForA = roundsAmount + pointsAmount;

      balances[playerA] += netForA;
      balances[playerB] -= netForA;

      audit.push({
        playerA,
        playerB,
        roundsAmount,
        pointsAmount,
        netForA,
      });
    }
  }

  const creditors = Object.entries(balances)
    .filter(([, balance]) => balance > 0)
    .map(([player, balance]) => ({ player, amount: balance }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = Object.entries(balances)
    .filter(([, balance]) => balance < 0)
    .map(([player, balance]) => ({ player, amount: Math.abs(balance) }))
    .sort((a, b) => b.amount - a.amount);

  const payments = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      payments.push({
        from: debtor.player,
        to: creditor.player,
        exact: amount,
        rounded: roundMompas(amount),
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }

  return { totals, balances, audit, payments };
}

function getSelectedFinishedGame() {
  if (selectedHistoryId !== null) {
    return history.find((savedGame) => String(savedGame.id) === String(selectedHistoryId)) || null;
  }
  return history[0] || (game?.finished ? game : null);
}

function getBestResult(targetGame) {
  const { balances } = calculateSettlement(targetGame);
  const [player, balance] = Object.entries(balances).sort((a, b) => b[1] - a[1])[0];
  return { player, balance };
}

function renderHistory() {
  return `
    <section class="screen">
      ${topbar("Historial", `${history.length} ${history.length === 1 ? "partida guardada" : "partidas guardadas"}`)}

      ${
        history.length
          ? `<div class="history-list">
              ${history
                .map((savedGame) => {
                  const best = getBestResult(savedGame);
                  return `
                    <button class="history-card" type="button" data-action="open-history-game" data-game-id="${savedGame.id}">
                      <div class="history-card-top">
                        <div>
                          <span class="history-date">${formatDate(savedGame.finishedAt || savedGame.createdAt)}</span>
                          <h3>${escapeHtml(normalizeGameName(savedGame))}</h3>
                        </div>
                        <span class="history-chevron">›</span>
                      </div>
                      <div class="history-meta">
                        <span>${savedGame.players.length} jugadores</span>
                        <span>${savedGame.rounds.length} rondas</span>
                      </div>
                      <div class="history-result">
                        <div>
                          <small>Mejor resultado</small>
                          <strong>🏆 ${escapeHtml(best.player)}</strong>
                        </div>
                        <div class="history-balance">
                          <small>Saldo principal</small>
                          <strong>${best.balance > 0 ? "+" : ""}${formatMoney(best.balance)}</strong>
                        </div>
                      </div>
                    </button>
                  `;
                })
                .join("")}
            </div>`
          : `
            <div class="card history-empty">
              <div>🃏</div>
              <h3>Todavía no hay partidas</h3>
              <p>Las partidas aparecerán aquí cuando finalices su liquidación.</p>
            </div>
          `
      }

      <div class="game-actions">
        <button class="btn btn-primary" type="button" data-action="new-game">Crear partida</button>
      </div>
    </section>
  `;
}

function renderResults() {
  const resultGame = getSelectedFinishedGame();
  if (!resultGame) return renderHome();
  const { totals, balances, audit, payments } = calculateSettlement(resultGame);

  return `
    <section class="screen">
      ${topbar(escapeHtml(normalizeGameName(resultGame)), `${resultGame.rounds.length} rondas · ${formatDate(resultGame.finishedAt || resultGame.createdAt)}`, selectedHistoryId !== null ? "history" : "home")}

      <div class="card result-hero">
        <div class="logo-small">🃏💵</div>
        <h2>Cuentas claras</h2>
        <p>Pagos optimizados para saldar toda la mesa.</p>
      </div>

      <div class="card">
        <span class="section-label">Pagos finales</span>
        ${
          payments.length
            ? `
              <div class="payment-list">
                ${payments
                  .map(
                    (payment) => `
                      <article class="payment">
                        <div class="payment-route">
                          <span>${escapeHtml(payment.from)}</span>
                          <span class="payment-arrow">→</span>
                          <span>${escapeHtml(payment.to)}</span>
                        </div>
                        <div class="payment-values">
                          <div>
                            <span>Exacto</span>
                            <div class="exact-value">${formatMoney(payment.exact)}</div>
                          </div>
                          <div>
                            <span>Mompas</span>
                            <div class="rounded-value">${formatMoney(payment.rounded)}</div>
                          </div>
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>
            `
            : `<div class="empty-state">La mesa quedó empatada. Nadie le paga a nadie.</div>`
        }
      </div>

      <details class="card">
        <summary>Balances exactos</summary>
        <div class="details-content balance-list">
          ${resultGame.players
            .map(
              (player) => `
                <div class="balance-row">
                  <span>${escapeHtml(player)}</span>
                  <span class="${balances[player] >= 0 ? "balance-positive" : "balance-negative"}">
                    ${balances[player] > 0 ? "+" : ""}${formatMoney(balances[player])}
                  </span>
                </div>
              `,
            )
            .join("")}
        </div>
      </details>

      <details class="card">
        <summary>Resumen deportivo</summary>
        <div class="details-content">
          <table class="score-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Ganadas</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              ${resultGame.players
                .map(
                  (player) => `
                    <tr>
                      <td>${escapeHtml(player)}</td>
                      <td class="wins-value">${totals[player].wins}</td>
                      <td>${formatNumber(totals[player].points)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </details>

      <details class="card">
        <summary>Auditoría todos contra todos</summary>
        <div class="details-content audit-list">
          ${audit
            .map((item) => {
              const winner =
                item.netForA === 0
                  ? "Empate"
                  : item.netForA > 0
                    ? `${item.playerB} debe a ${item.playerA}`
                    : `${item.playerA} debe a ${item.playerB}`;
              return `
                <div class="audit-row">
                  <div class="audit-copy">
                    <strong>${escapeHtml(item.playerA)} vs. ${escapeHtml(item.playerB)}</strong>
                    <small>
                      Rondas: ${formatMoney(item.roundsAmount)} ·
                      Puntos: ${formatMoney(item.pointsAmount)}<br />
                      ${escapeHtml(winner)}
                    </small>
                  </div>
                  <div class="audit-amount">${formatMoney(Math.abs(item.netForA))}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </details>

      <div class="game-actions">
        <button class="btn btn-primary btn-share" type="button" data-action="share-result">
          <span aria-hidden="true">↗</span> Compartir resultado
        </button>
        <button class="btn btn-primary" type="button" data-action="new-game">Nueva partida</button>
        <button class="btn btn-secondary" type="button" data-action="view-history">Ver historial</button>
      </div>
    </section>
  `;
}

function render() {
  if (screen === "game" && !game) screen = "home";
  if (screen === "round" && !game) screen = "home";
  if (screen === "results" && !getSelectedFinishedGame()) screen = "home";

  const views = {
    home: renderHome,
    create: renderCreateGame,
    game: renderGame,
    round: renderRound,
    history: renderHistory,
    settings: renderSettings,
    results: renderResults,
  };

  app.innerHTML = views[screen]();
}

function createGame(form) {
  const formData = new FormData(form);
  const gameName = String(formData.get("gameName") || "").trim();
  const players = formData.getAll("players");
  const roundValue = Number(formData.get("roundValue"));
  const pointValue = Number(formData.get("pointValue"));

  if (players.length < 2) {
    showToast("Selecciona al menos 2 jugadores.");
    return;
  }

  if (!gameName) {
    showToast("Escribe un nombre para la partida.");
    return;
  }

  if (!Number.isFinite(roundValue) || !Number.isFinite(pointValue) || roundValue < 0 || pointValue < 0) {
    showToast("Revisa los valores de ronda y punto.");
    return;
  }

  game = {
    id: Date.now(),
    name: gameName,
    createdAt: new Date().toISOString(),
    players,
    roundValue,
    pointValue,
    rounds: [],
    finished: false,
  };
  saveGame();
  roundDraft = null;
  goTo("game");
}

function saveRound(form) {
  if (!roundDraft?.winner) {
    showToast("Selecciona una persona ganadora.");
    return;
  }

  const formData = new FormData(form);
  const points = {};

  for (const [index, player] of game.players.entries()) {
    if (player === roundDraft.winner) {
      points[player] = 0;
      continue;
    }

    const rawValue = formData.get(`points-${index}`);
    const value = Number(rawValue);
    if (rawValue === null || rawValue === "" || !Number.isInteger(value) || value < 0) {
      showToast(`Ingresa los puntos de ${player}.`);
      return;
    }
    points[player] = value;
  }

  game.rounds.push({
    winner: roundDraft.winner,
    points,
    createdAt: new Date().toISOString(),
  });
  saveGame();
  roundDraft = null;
  showToast("Ronda guardada.");
  goTo("game");
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "back") {
    const target = button.dataset.target || "home";
    if (screen === "round") roundDraft = null;
    goTo(target);
  }

  if (action === "new-game") {
    if (game && !game.finished) {
      const confirmed = window.confirm("Hay una partida en curso. ¿Quieres reemplazarla?");
      if (!confirmed) return;
    }
    goTo("create");
  }

  if (action === "continue-game") goTo("game");
  if (action === "view-latest-results") {
    selectedHistoryId = history[0]?.id ?? null;
    goTo("results");
  }
  if (action === "view-history") {
    selectedHistoryId = null;
    goTo("history");
  }
  if (action === "view-settings") goTo("settings");
  if (action === "open-history-game") {
    selectedHistoryId = button.dataset.gameId;
    goTo("results");
  }

  if (action === "register-round") {
    roundDraft = null;
    goTo("round");
  }

  if (action === "select-winner") {
    const form = document.querySelector("#round-form");
    if (form && roundDraft) {
      game.players.forEach((player, index) => {
        const input = form.elements[`points-${index}`];
        if (input && player !== roundDraft.winner) {
          roundDraft.points[player] = input.value;
        }
      });
    }
    roundDraft.winner = game.players[Number(button.dataset.playerIndex)];
    roundDraft.points[roundDraft.winner] = 0;
    render();
  }

  if (action === "delete-regular-player") {
    const index = Number(button.dataset.playerIndex);
    regularPlayers.splice(index, 1);
    saveRegularPlayers();
    render();
    showToast("Jugador eliminado.");
  }

  if (action === "finish-game") {
    game.finished = true;
    game.name = normalizeGameName(game, history.length);
    game.finishedAt = new Date().toISOString();
    saveGame();
    const savedIndex = history.findIndex((savedGame) => savedGame.id === game.id);
    if (savedIndex >= 0) {
      history[savedIndex] = cloneGame(game);
    } else {
      history.unshift(cloneGame(game));
    }
    saveHistory();
    selectedHistoryId = game.id;
    goTo("results");
  }

  if (action === "share-result") {
    await shareResult(button);
  }

});

app.addEventListener("submit", (event) => {
  event.preventDefault();

  if (event.target.id === "create-game-form") {
    createGame(event.target);
  }

  if (event.target.id === "round-form") {
    saveRound(event.target);
  }

  if (event.target.id === "regular-players-form") {
    const formData = new FormData(event.target);
    const editedPlayers = formData
      .getAll("regularPlayer")
      .map((player) => String(player).trim())
      .filter(Boolean);
    const uniqueNames = new Set(editedPlayers.map((player) => player.toLocaleLowerCase("es")));

    if (uniqueNames.size !== editedPlayers.length) {
      showToast("No puede haber jugadores con el mismo nombre.");
      return;
    }

    regularPlayers = editedPlayers;
    saveRegularPlayers();
    render();
    showToast("Jugadores actualizados.");
  }

  if (event.target.id === "add-player-form") {
    const formData = new FormData(event.target);
    const playerName = String(formData.get("playerName") || "").trim();
    const alreadyExists = regularPlayers.some(
      (player) => player.toLocaleLowerCase("es") === playerName.toLocaleLowerCase("es"),
    );

    if (!playerName) {
      showToast("Escribe el nombre del jugador.");
      return;
    }
    if (alreadyExists) {
      showToast("Ese jugador ya está en la lista.");
      return;
    }

    regularPlayers.push(playerName);
    saveRegularPlayers();
    render();
    showToast("Jugador agregado.");
  }
});

app.addEventListener("input", (event) => {
  if (screen !== "round" || !roundDraft || event.target.type !== "number") return;
  const player = game.players[Number(event.target.dataset.playerIndex)];
  roundDraft.points[player] = event.target.value;
});

render();
