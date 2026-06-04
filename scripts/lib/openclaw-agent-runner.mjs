import { spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { formatDuration } from './agent-session-record.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(__dirname, '../..');

/** OpenClaw CLI `--timeout 0` = no Gateway wait limit (avoids EMBEDDED FALLBACK at ~630s). */
export const DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS = 0;
/** 0 = wrapper does not cap turn duration. */
export const DEFAULT_MAX_TURN_MS = 0;
/** Only kill CLI if session jsonl is idle this long (browser-heavy runs stay noisy). */
export const DEFAULT_TURN_IDLE_MS = 600_000;

export function sessionJsonlPath(sessionId) {
  return resolve(homedir(), '.openclaw', 'agents', 'main', 'sessions', `${sessionId}.jsonl`);
}

function parseSessionLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function summarizeSessionActivity(events) {
  let browserCalls = 0;
  let writeCalls = 0;
  let lastTool = '';
  let lastText = '';
  let lastTs = '';

  for (const ev of events) {
    if (ev.type !== 'message') continue;
    const msg = ev.message ?? {};
    lastTs = ev.timestamp ?? lastTs;
    if (msg.role === 'assistant') {
      for (const part of msg.content ?? []) {
        if (part.type === 'toolCall') {
          const name = part.name ?? 'tool';
          lastTool = name;
          if (name === 'browser') browserCalls += 1;
          if (name === 'write') writeCalls += 1;
          const args = part.arguments ?? {};
          if (name === 'browser' && args.action) {
            lastTool = `browser/${args.action}`;
          }
        } else if (part.type === 'text' && part.text) {
          lastText = part.text.replace(/\s+/g, ' ').slice(0, 80);
        }
      }
    }
  }

  return { browserCalls, writeCalls, lastTool, lastText, lastTs };
}

/** Last assistant message metadata — used to detect turn-complete idle hang. */
export function readLastAssistantMeta(sessionId) {
  const jsonlPath = sessionJsonlPath(sessionId);
  if (!existsSync(jsonlPath)) return null;
  let last = null;
  for (const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const ev = parseSessionLine(line);
    if (ev?.type !== 'message' || ev.message?.role !== 'assistant') continue;
    const content = ev.message.content ?? [];
    last = {
      timestamp: ev.timestamp ?? '',
      stopReason: ev.message.stopReason ?? '',
      hasToolCalls: content.some((p) => p.type === 'toolCall'),
      text: content.filter((p) => p.type === 'text').map((p) => p.text).join('\n').slice(0, 200),
    };
  }
  return last;
}

/**
 * Tail session jsonl and emit heartbeat lines while agent runs.
 */
export function startSessionProgressMonitor({
  sessionId,
  phase = 'agent',
  log = console.error,
  getMetrics = () => '',
  intervalMs = 20_000,
}) {
  const jsonlPath = sessionJsonlPath(sessionId);
  const startedMs = Date.now();
  let offset = 0;
  let cumulative = { browserCalls: 0, writeCalls: 0, lastTool: '', lastText: '', lastTs: '' };
  let beats = 0;

  log(`[${phase}] monitor: tail ${jsonlPath} every ${Math.round(intervalMs / 1000)}s`);

  const timer = setInterval(() => {
    beats += 1;
    const elapsed = formatDuration(Date.now() - startedMs);

    if (existsSync(jsonlPath)) {
      try {
        const content = readFileSync(jsonlPath, 'utf8');
        if (content.length > offset) {
          const chunk = content.slice(offset);
          offset = content.length;
          const lines = chunk.split('\n').filter(Boolean);
          const events = lines.map(parseSessionLine).filter(Boolean);
          const delta = summarizeSessionActivity(events);
          cumulative.browserCalls += delta.browserCalls;
          cumulative.writeCalls += delta.writeCalls;
          if (delta.lastTool) cumulative.lastTool = delta.lastTool;
          if (delta.lastText) cumulative.lastText = delta.lastText;
          if (delta.lastTs) cumulative.lastTs = delta.lastTs;
        }
      } catch {
        // ignore read races while jsonl is being written
      }
    }

    const metrics = getMetrics();
    const activity = cumulative.lastTool || cumulative.lastText || 'waiting…';
    const ts = cumulative.lastTs ? cumulative.lastTs.slice(11, 19) : '—';
    log(
      `[${phase}] ♥ ${elapsed} | browser=${cumulative.browserCalls} write=${cumulative.writeCalls} | ${metrics} | last@${ts} ${activity}`,
    );

    if (beats === 1) {
      log(`[${phase}] agent turn in progress — output streams below when OpenClaw flushes`);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

/**
 * Run openclaw agent with live stdout/stderr (not buffered until exit).
 */
export function detectEmbeddedFallback(outputText) {
  return /EMBEDDED FALLBACK|gateway-fallback-|fallbackReason["']?\s*:\s*["']gateway_timeout/i.test(
    outputText,
  );
}

/** Stop Gateway agent turn when wrapper exits (CLI dead but Gateway may still run). */
export function abortGatewayAgentSession(sessionId, log = console.error) {
  if (!sessionId || sessionId === 'main') return false;
  const sessionKey = `agent:main:explicit:${sessionId}`;
  log(`[agent] abort gateway: ${sessionKey}`);
  const r = spawnSync(
    'openclaw',
    ['gateway', 'call', 'chat.abort', '--params', JSON.stringify({ sessionKey }), '--timeout', '15000'],
    { cwd: WORKSPACE, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  );
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) {
    log(`[agent] chat.abort warn: ${out.slice(0, 200)}`);
    return false;
  }
  return /"aborted"\s*:\s*true/.test(out);
}

export function runOpenClawAgent({
  sessionId,
  message,
  local = false,
  verbose = true,
  log = console.error,
  turnIdleMs = DEFAULT_TURN_IDLE_MS,
  maxTurnMs = DEFAULT_MAX_TURN_MS,
  agentTimeoutSeconds = DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS,
}) {
  const agentArgv = ['agent', '-m', message, '--session-id', sessionId];
  if (local) agentArgv.push('--local');
  else if (agentTimeoutSeconds !== undefined && agentTimeoutSeconds !== null) {
    agentArgv.push('--timeout', String(agentTimeoutSeconds));
  }
  if (verbose) agentArgv.push('--verbose', 'on');

  const mode = local ? 'embedded (--local)' : `gateway (--timeout ${agentTimeoutSeconds})`;
  const turnCap = maxTurnMs > 0 ? `${Math.round(maxTurnMs / 60_000)}m` : 'none';
  log(`[agent] mode=${mode} turnIdle=${Math.round(turnIdleMs / 1000)}s maxTurn=${turnCap} session=${sessionId}`);
  log(`[agent] exec: openclaw agent -m … --session-id ${sessionId}`);

  return new Promise((resolvePromise, reject) => {
    const child = spawn('openclaw', agentArgv, {
      cwd: WORKSPACE,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let killedForIdle = false;
    const startedMs = Date.now();
    const jsonlPath = sessionJsonlPath(sessionId);
    let lastJsonlSize = 0;
    let lastGrowthMs = startedMs;
    let sawJsonl = false;

    const stopWatchdog = () => clearInterval(watchdog);
    const watchdog = setInterval(() => {
      if (child.exitCode !== null || child.killed) return;
      const now = Date.now();
      if (maxTurnMs > 0 && now - startedMs > maxTurnMs) {
        log(`[agent] max turn ${Math.round(maxTurnMs / 60_000)}m reached — stopping CLI`);
        killedForIdle = true;
        child.kill('SIGTERM');
        return;
      }
      if (!existsSync(jsonlPath)) return;
      try {
        const size = readFileSync(jsonlPath).length;
        if (size > lastJsonlSize) {
          lastJsonlSize = size;
          lastGrowthMs = now;
          sawJsonl = true;
          return;
        }
      } catch {
        return;
      }
      if (!sawJsonl || now - lastGrowthMs < turnIdleMs) return;

      const last = readLastAssistantMeta(sessionId);
      const idleSec = Math.round((now - lastGrowthMs) / 1000);
      if (last?.stopReason === 'stop' && !last?.hasToolCalls) {
        log(`[agent] turn complete (stopReason=stop), jsonl idle ${idleSec}s — closing CLI for auto-continue`);
      } else {
        log(`[agent] jsonl idle ${idleSec}s — closing stuck CLI`);
      }
      killedForIdle = true;
      child.kill('SIGTERM');
    }, 15_000);

    child.stdout?.on('data', (chunk) => {
      const s = chunk.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr?.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });

    child.on('error', (err) => {
      stopWatchdog();
      reject(err);
    });
    child.on('close', (status, signal) => {
      stopWatchdog();
      const output = `${stdout}\n${stderr}`;
      const embeddedFallback = detectEmbeddedFallback(output);
      if (embeddedFallback) {
        log('[agent] FATAL: OpenClaw EMBEDDED FALLBACK detected — abort turn (fix: use gateway + --timeout 0)');
      }
      resolvePromise({
        status: status ?? 1,
        stdout,
        stderr,
        signal,
        killedForIdle,
        embeddedFallback,
      });
    });
  });
}

export function detectEarlyApplyStop(outputText, submitted, target) {
  if (submitted >= target) return false;
  return /wrap up|final report|session report|batch complete|done for today| stopping|是否需要我继续|调整搜索策略|已达到页面搜索|仅完成 \d+ 个|\d+\/10 ✅（仅完成/i.test(
    outputText,
  );
}
