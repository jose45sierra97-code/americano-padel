import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, configOk } from "./supabase.js";

// ---------- Rotación americano 8 jugadores (índices 0-7) ----------
const ROTACION = [
  [[[0,7],[3,4]], [[1,6],[2,5]]],
  [[[1,7],[4,5]], [[2,0],[3,6]]],
  [[[2,7],[5,6]], [[3,1],[4,0]]],
  [[[3,7],[6,0]], [[4,2],[5,1]]],
  [[[4,7],[0,1]], [[5,3],[6,2]]],
  [[[5,7],[1,2]], [[6,4],[0,3]]],
  [[[6,7],[2,3]], [[0,5],[1,4]]],
];
const BONUS = [5, 3, 2];

// ---------- Cálculos ----------
function statsDeFecha(fecha) {
  const results = fecha.results || {};
  const stats = {};
  fecha.player_ids.forEach((id) => (stats[id] = { pj: 0, pg: 0, pts: 0, gf: 0, gc: 0 }));
  (fecha.rotacion || ROTACION).forEach((ronda, r) => {
    ronda.forEach((match, c) => {
      const res = results[`${r}-${c}`];
      if (!res || res.a === "" || res.b === "" || res.a === res.b) return;
      const ga = Number(res.a), gb = Number(res.b);
      const [pa, pb] = match;
      const idsA = pa.map((i) => fecha.player_ids[i]);
      const idsB = pb.map((i) => fecha.player_ids[i]);
      idsA.forEach((id) => { stats[id].pj++; stats[id].gf += ga; stats[id].gc += gb; if (ga > gb) { stats[id].pg++; stats[id].pts += 3; } });
      idsB.forEach((id) => { stats[id].pj++; stats[id].gf += gb; stats[id].gc += ga; if (gb > ga) { stats[id].pg++; stats[id].pts += 3; } });
    });
  });
  return stats;
}

function ordenarTabla(ids, stats, nameOf) {
  return [...ids].sort((x, y) => {
    const a = stats[x], b = stats[y];
    if (b.pts !== a.pts) return b.pts - a.pts;
    const da = a.gf - a.gc, db = b.gf - b.gc;
    if (db !== da) return db - da;
    return nameOf(x).localeCompare(nameOf(y));
  });
}

// ---------- App ----------
export default function App() {
  const [torneos, setTorneos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [fechas, setFechas] = useState([]);
  const [activoId, setActivoId] = useState(null);
  const [tab, setTab] = useState("fechas");
  const [fechaAbierta, setFechaAbierta] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [seleccion, setSeleccion] = useState([]);
  const [creandoFecha, setCreandoFecha] = useState(false);
  const [editandoCruces, setEditandoCruces] = useState(false);
  const [formTorneo, setFormTorneo] = useState(null);
  const [aviso, setAviso] = useState("");
  const [pend, setPend] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const activoRef = useRef(null);
  activoRef.current = activoId;

  const avisar = (m) => { setAviso(m); setTimeout(() => setAviso(""), 4500); };
  const pedirConfirm = (id, fn) => {
    if (pend === id) { setPend(null); fn(); }
    else { setPend(id); setTimeout(() => setPend((p) => (p === id ? null : p)), 4000); }
  };

  const cargarTodo = useCallback(async () => {
    if (!supabase) return;
    const [t, j, f] = await Promise.all([
      supabase.from("torneos").select("*").order("created_at"),
      supabase.from("jugadores").select("*").order("orden").order("created_at"),
      supabase.from("fechas").select("*").order("created_at"),
    ]);
    if (t.error || j.error || f.error) { avisar("Error de conexión con la base. Revisá internet o la configuración."); return; }
    setTorneos(t.data); setJugadores(j.data); setFechas(f.data);
    if (!activoRef.current && t.data.length) setActivoId(t.data[0].id);
    if (activoRef.current && !t.data.find((x) => x.id === activoRef.current)) setActivoId(t.data[0]?.id || null);
  }, []);

  useEffect(() => {
    (async () => { await cargarTodo(); setCargado(true); })();
    if (!supabase) return;
    const ch = supabase
      .channel("cambios")
      .on("postgres_changes", { event: "*", schema: "public" }, () => cargarTodo())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [cargarTodo]);

  const db = async (fn) => {
    setGuardando(true);
    try {
      const { error } = await fn();
      if (error) throw error;
    } catch (e) {
      console.error(e);
      avisar("No se pudo guardar. Reintentá en unos segundos.");
    } finally {
      await cargarTodo();
      setGuardando(false);
    }
  };

  const torneo = torneos.find((t) => t.id === activoId) || null;
  const misJugadores = jugadores.filter((j) => j.torneo_id === activoId);
  const misFechas = fechas.filter((f) => f.torneo_id === activoId);
  const nameOf = (id) => jugadores.find((p) => p.id === id)?.name || "?";

  // ---------- Torneos ----------
  const guardarFormTorneo = () => {
    const nombre = formTorneo?.valor.trim();
    if (!nombre) return;
    if (formTorneo.modo === "crear") {
      db(async () => {
        const r = await supabase.from("torneos").insert({ name: nombre }).select().single();
        if (!r.error) { setActivoId(r.data.id); setTab("jugadores"); setFechaAbierta(null); }
        return r;
      });
    } else {
      db(() => supabase.from("torneos").update({ name: nombre }).eq("id", torneo.id));
    }
    setFormTorneo(null);
  };
  const borrarTorneo = () => {
    setFechaAbierta(null);
    db(() => supabase.from("torneos").delete().eq("id", torneo.id));
  };
  const cambiarTorneo = (id) => {
    setActivoId(id);
    setFechaAbierta(null); setEditandoCruces(false); setCreandoFecha(false); setSeleccion([]);
  };

  // ---------- Jugadores ----------
  const agregarJugador = () => {
    const nombres = nuevoNombre.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!nombres.length) return;
    const base = misJugadores.length;
    db(() => supabase.from("jugadores").insert(
      nombres.map((n, i) => ({ torneo_id: activoId, name: n, orden: base + i }))
    ));
    setNuevoNombre("");
  };
  const borrarJugador = (id) => {
    const usado = misFechas.some((f) => f.player_ids.includes(id));
    if (usado) { avisar("Este jugador ya está en una fecha. Eliminá la fecha primero."); return; }
    db(() => supabase.from("jugadores").delete().eq("id", id));
  };

  // ---------- Fechas ----------
  const generarFechasIniciales = () => {
    if (misJugadores.length < 32) { avisar(`Necesitás 32 jugadores para generar los 4 grupos (hay ${misJugadores.length}).`); return; }
    const nuevas = [0, 1, 2, 3].map((g) => ({
      torneo_id: activoId,
      name: `Fecha ${misFechas.length + g + 1}`,
      player_ids: misJugadores.slice(g * 8, g * 8 + 8).map((p) => p.id),
    }));
    db(() => supabase.from("fechas").insert(nuevas));
  };

  const crearFechaManual = () => {
    if (seleccion.length !== 8) return;
    db(async () => {
      const r = await supabase.from("fechas")
        .insert({ torneo_id: activoId, name: `Fecha ${misFechas.length + 1}`, player_ids: seleccion })
        .select().single();
      if (!r.error) setFechaAbierta(r.data.id);
      return r;
    });
    setSeleccion([]); setCreandoFecha(false);
  };

  const setResultado = (fecha, key, campo, valor) => {
    if (valor !== "" && (!/^\d{1,2}$/.test(valor))) return;
    const results = { ...(fecha.results || {}) };
    results[key] = { ...(results[key] || { a: "", b: "" }), [campo]: valor };
    // Actualización local inmediata para no perder el foco al escribir
    setFechas(fechas.map((f) => f.id === fecha.id ? { ...f, results } : f));
    db(() => supabase.from("fechas").update({ results }).eq("id", fecha.id));
  };

  const setSlot = (fecha, r, c, p, pos, val) => {
    const rot = JSON.parse(JSON.stringify(fecha.rotacion || ROTACION));
    rot[r][c][p][pos] = Number(val);
    setFechas(fechas.map((f) => f.id === fecha.id ? { ...f, rotacion: rot } : f));
    db(() => supabase.from("fechas").update({ rotacion: rot }).eq("id", fecha.id));
  };
  const restaurarRotacion = (fecha) => {
    db(() => supabase.from("fechas").update({ rotacion: null }).eq("id", fecha.id));
  };

  const cerrarFecha = (fecha) => {
    const stats = statsDeFecha(fecha);
    const orden = ordenarTabla(fecha.player_ids, stats, nameOf);
    const bonuses = {};
    orden.slice(0, 3).forEach((id, i) => (bonuses[id] = BONUS[i]));
    db(() => supabase.from("fechas").update({ closed: true, bonuses }).eq("id", fecha.id));
  };
  const reabrirFecha = (fecha) => {
    db(() => supabase.from("fechas").update({ closed: false, bonuses: {} }).eq("id", fecha.id));
  };
  const borrarFecha = (fecha) => {
    setFechaAbierta(null);
    db(() => supabase.from("fechas").delete().eq("id", fecha.id));
  };

  // ---------- Tabla general ----------
  const tablaGeneral = () => {
    const g = {};
    misJugadores.forEach((p) => (g[p.id] = { pj: 0, pg: 0, pts: 0, bonus: 0, gf: 0, gc: 0 }));
    misFechas.forEach((f) => {
      const s = statsDeFecha(f);
      f.player_ids.forEach((id) => {
        if (!g[id]) return;
        g[id].pj += s[id].pj; g[id].pg += s[id].pg; g[id].pts += s[id].pts;
        g[id].gf += s[id].gf; g[id].gc += s[id].gc;
      });
      Object.entries(f.bonuses || {}).forEach(([id, b]) => { if (g[id]) g[id].bonus += b; });
    });
    return misJugadores.map((p) => p.id).sort((x, y) => {
      const a = g[x], b = g[y];
      const ta = a.pts + a.bonus, tb = b.pts + b.bonus;
      if (tb !== ta) return tb - ta;
      const da = a.gf - a.gc, db2 = b.gf - b.gc;
      if (db2 !== da) return db2 - da;
      return nameOf(x).localeCompare(nameOf(y));
    }).map((id) => ({ id, ...g[id] }));
  };

  if (!configOk) return (
    <div style={css.page}>
      <div style={{ ...css.card, marginTop: 40 }}>
        <h2 style={{ marginTop: 0 }}>Falta configurar Supabase</h2>
        <p style={{ color: "#B8C7D0" }}>Definí las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (en <code>.env</code> local o en las variables de entorno de Netlify) y volvé a deployar.</p>
      </div>
    </div>
  );

  if (!cargado) return <div style={css.page}><p style={{ color: "#8FA3B0", padding: 40 }}>Cargando…</p></div>;

  const fecha = misFechas.find((f) => f.id === fechaAbierta);

  return (
    <div style={css.page}>
      <style>{`
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
        input[type=number]{ -moz-appearance:textfield; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #D8F542; outline-offset: 2px; }
      `}</style>

      <header style={css.header}>
        <div style={css.logoBall} aria-hidden="true" />
        <div>
          <h1 style={css.h1}>AMERICANO DE PÁDEL</h1>
          <p style={css.sub}>Todos contra todos · set único · 3 pts por victoria + bonus 5/3/2</p>
        </div>
        {guardando && <span style={{ marginLeft: "auto", color: "#5A6E7C", fontSize: 12 }}>Guardando…</span>}
      </header>

      {/* ------- SELECTOR DE CAMPEONATO ------- */}
      <div style={css.barraTorneos}>
        {torneos.map((t) => (
          <button key={t.id} onClick={() => cambiarTorneo(t.id)}
            style={{ ...css.chipTorneo, ...(t.id === activoId ? css.chipTorneoActivo : {}) }}>
            {t.name}
          </button>
        ))}
        <button onClick={() => setFormTorneo(formTorneo?.modo === "crear" ? null : { modo: "crear", valor: "" })}
          style={{ ...css.chipTorneo, color: "#6FB8E8", borderStyle: "dashed" }}>+ Campeonato</button>
        {torneo && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={() => setFormTorneo(formTorneo?.modo === "renombrar" ? null : { modo: "renombrar", valor: torneo.name })}
              style={css.btnMini} title="Renombrar campeonato">✎</button>
            <button onClick={() => pedirConfirm("delTorneo", borrarTorneo)}
              style={{ ...css.btnMini, color: "#E85D5D", ...(pend === "delTorneo" ? { background: "#3A1515", borderColor: "#E85D5D" } : {}) }}>
              {pend === "delTorneo" ? "¿Borrar TODO este campeonato? Tocá de nuevo" : "🗑"}
            </button>
          </div>
        )}
      </div>

      {formTorneo && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input autoFocus value={formTorneo.valor} placeholder="Nombre del campeonato (ej: 5ta, 4ta)"
            onChange={(e) => setFormTorneo({ ...formTorneo, valor: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && guardarFormTorneo()}
            style={{ ...css.input, flex: 1 }} />
          <button onClick={guardarFormTorneo} style={css.btnPrimario}>
            {formTorneo.modo === "crear" ? "Crear" : "Renombrar"}
          </button>
          <button onClick={() => setFormTorneo(null)} style={css.btnSecundario}>Cancelar</button>
        </div>
      )}

      {aviso && <div style={css.aviso}>{aviso}</div>}

      {!torneo && (
        <section style={css.card}>
          <p style={css.vacio}>Creá tu primer campeonato con el botón "+ Campeonato" (ej: 5ta y 4ta por separado).</p>
        </section>
      )}

      {torneo && (
        <>
          <nav style={css.tabs}>
            {[["fechas", "Fechas"], ["general", "Tabla general"], ["jugadores", `Jugadores (${misJugadores.length})`]].map(([k, label]) => (
              <button key={k} onClick={() => { setTab(k); setFechaAbierta(null); }}
                style={{ ...css.tab, ...(tab === k ? css.tabActiva : {}) }}>{label}</button>
            ))}
          </nav>

          {/* ------- JUGADORES ------- */}
          {tab === "jugadores" && (
            <section style={css.card}>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <textarea value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre (o varios separados por coma o renglón)"
                  rows={2} style={{ ...css.input, flex: 1, resize: "vertical" }} />
                <button onClick={agregarJugador} style={css.btnPrimario}>Agregar</button>
              </div>
              {misJugadores.length === 0 && <p style={css.vacio}>Cargá los jugadores de {torneo.name}. Podés pegar la lista completa de una vez.</p>}
              <div style={css.gridJugadores}>
                {misJugadores.map((p, i) => (
                  <div key={p.id} style={css.chipJugador}>
                    <span style={css.numChip}>{i + 1}</span>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <button onClick={() => borrarJugador(p.id)} style={css.btnX} aria-label={`Eliminar ${p.name}`}>×</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ------- FECHAS: LISTA ------- */}
          {tab === "fechas" && !fecha && (
            <section>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <button onClick={() => misFechas.length > 0 ? pedirConfirm("gen4", generarFechasIniciales) : generarFechasIniciales()}
                  style={{ ...css.btnPrimario, ...(pend === "gen4" ? { background: "#E8B85D" } : {}) }}>
                  {pend === "gen4" ? "Ya hay fechas, ¿agregar 4 más? Tocá de nuevo" : "Generar fechas 1–4 (grupos de 8)"}
                </button>
                <button onClick={() => setCreandoFecha(!creandoFecha)} style={css.btnSecundario}>
                  {creandoFecha ? "Cancelar" : "Nueva fecha manual"}
                </button>
              </div>

              {creandoFecha && (
                <div style={{ ...css.card, marginBottom: 12 }}>
                  <p style={{ margin: "0 0 10px", color: "#B8C7D0" }}>Elegí 8 jugadores ({seleccion.length}/8):</p>
                  <div style={css.gridJugadores}>
                    {misJugadores.map((p) => {
                      const sel = seleccion.includes(p.id);
                      return (
                        <button key={p.id}
                          onClick={() => setSeleccion(sel ? seleccion.filter((x) => x !== p.id) : seleccion.length < 8 ? [...seleccion, p.id] : seleccion)}
                          style={{ ...css.chipJugador, cursor: "pointer", border: sel ? "1px solid #D8F542" : "1px solid #22303B", background: sel ? "#1C2A16" : "#131C24", color: sel ? "#D8F542" : "#E8EEF2" }}>
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={crearFechaManual} disabled={seleccion.length !== 8}
                    style={{ ...css.btnPrimario, marginTop: 12, opacity: seleccion.length === 8 ? 1 : 0.4 }}>
                    Crear fecha
                  </button>
                </div>
              )}

              {misFechas.length === 0 && !creandoFecha && (
                <p style={css.vacio}>Todavía no hay fechas en {torneo.name}. Generá las 4 iniciales o armá una manual.</p>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                {misFechas.map((f) => {
                  const cargados = Object.values(f.results || {}).filter((r) => r.a !== "" && r.b !== "" && r.a !== r.b).length;
                  return (
                    <button key={f.id} onClick={() => setFechaAbierta(f.id)} style={css.filaFecha}>
                      <div style={{ textAlign: "left" }}>
                        <strong style={{ fontSize: 16 }}>{f.name}</strong>
                        <div style={{ color: "#8FA3B0", fontSize: 13, marginTop: 2 }}>
                          {f.player_ids.map(nameOf).join(" · ")}
                        </div>
                      </div>
                      <span style={{ ...css.badge, background: f.closed ? "#1C2A16" : "#132435", color: f.closed ? "#D8F542" : "#6FB8E8" }}>
                        {f.closed ? "Cerrada" : `${cargados}/14 partidos`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ------- FECHA: DETALLE ------- */}
          {tab === "fechas" && fecha && (() => {
            const stats = statsDeFecha(fecha);
            const orden = ordenarTabla(fecha.player_ids, stats, nameOf);
            const rot = fecha.rotacion || ROTACION;
            const cargadosF = Object.values(fecha.results || {}).filter((r) => r.a !== "" && r.b !== "" && r.a !== r.b).length;
            const duplicadosEnRonda = (ronda) => {
              const usados = ronda.flat(2);
              return usados.filter((v, i) => usados.indexOf(v) !== i).length > 0;
            };
            return (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <button onClick={() => { setFechaAbierta(null); setEditandoCruces(false); }} style={css.btnSecundario}>← Fechas</button>
                  <h2 style={{ margin: 0, fontSize: 20, letterSpacing: 1 }}>{fecha.name}</h2>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!fecha.closed && (
                      <button onClick={() => setEditandoCruces(!editandoCruces)} style={{ ...css.btnSecundario, ...(editandoCruces ? { borderColor: "#D8F542", color: "#D8F542" } : {}) }}>
                        {editandoCruces ? "Listo, guardar cruces" : "Editar cruces"}
                      </button>
                    )}
                    {editandoCruces && fecha.rotacion && (
                      <button onClick={() => pedirConfirm("restRot", () => restaurarRotacion(fecha))}
                        style={{ ...css.btnSecundario, ...(pend === "restRot" ? { borderColor: "#E8B85D", color: "#E8B85D" } : {}) }}>
                        {pend === "restRot" ? "¿Seguro? Tocá de nuevo" : "Restaurar original"}
                      </button>
                    )}
                    {!fecha.closed
                      ? <button onClick={() => cargadosF >= 14 ? cerrarFecha(fecha) : pedirConfirm("cerrarF", () => cerrarFecha(fecha))}
                          style={{ ...css.btnPrimario, ...(pend === "cerrarF" ? { background: "#E8B85D" } : {}) }}>
                          {pend === "cerrarF" ? `Faltan ${14 - cargadosF} partidos, ¿cerrar igual?` : "Cerrar fecha (asignar bonus)"}
                        </button>
                      : <button onClick={() => reabrirFecha(fecha)} style={css.btnSecundario}>Reabrir</button>}
                    <button onClick={() => pedirConfirm("delF", () => borrarFecha(fecha))}
                      style={{ ...css.btnPeligro, ...(pend === "delF" ? { background: "#3A1515" } : {}) }}>
                      {pend === "delF" ? "¿Eliminar con sus resultados? Tocá de nuevo" : "Eliminar"}
                    </button>
                  </div>
                </div>

                <div style={css.layoutFecha}>
                  <div style={{ display: "grid", gap: 10 }}>
                    {rot.map((ronda, r) => (
                      <div key={r} style={css.card}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={css.rondaTitulo}>RONDA {r + 1}</div>
                          {editandoCruces && duplicadosEnRonda(ronda) && (
                            <span style={{ color: "#E85D5D", fontSize: 12, marginBottom: 10 }}>⚠ Hay un jugador repetido en esta ronda</span>
                          )}
                        </div>
                        {ronda.map((match, c) => {
                          const key = `${r}-${c}`;
                          const res = fecha.results?.[key] || { a: "", b: "" };
                          const [pa, pb] = match;
                          const empate = res.a !== "" && res.b !== "" && res.a === res.b;
                          const selJugador = (p, pos) => (
                            <select value={match[p][pos]} onChange={(e) => setSlot(fecha, r, c, p, pos, e.target.value)} style={css.select}>
                              {fecha.player_ids.map((id, idx) => <option key={id} value={idx}>{nameOf(id)}</option>)}
                            </select>
                          );
                          if (editandoCruces) return (
                            <div key={c} style={css.partidoEdit}>
                              <span style={css.cancha}>C{c + 1}</span>
                              {selJugador(0, 0)}{selJugador(0, 1)}
                              <span style={{ color: "#5A6E7C", fontSize: 12 }}>vs</span>
                              {selJugador(1, 0)}{selJugador(1, 1)}
                            </div>
                          );
                          return (
                            <div key={c} style={css.partido}>
                              <span style={css.cancha}>C{c + 1}</span>
                              <span style={{ ...css.pareja, textAlign: "right", color: Number(res.a) > Number(res.b) && res.b !== "" ? "#D8F542" : "#E8EEF2" }}>
                                {pa.map((i) => nameOf(fecha.player_ids[i])).join(" / ")}
                              </span>
                              <input type="number" min="0" max="12" value={res.a} disabled={fecha.closed}
                                onChange={(e) => setResultado(fecha, key, "a", e.target.value)}
                                style={{ ...css.score, borderColor: empate ? "#E85D5D" : "#22303B" }} aria-label="Games pareja 1" />
                              <span style={{ color: "#5A6E7C" }}>–</span>
                              <input type="number" min="0" max="12" value={res.b} disabled={fecha.closed}
                                onChange={(e) => setResultado(fecha, key, "b", e.target.value)}
                                style={{ ...css.score, borderColor: empate ? "#E85D5D" : "#22303B" }} aria-label="Games pareja 2" />
                              <span style={{ ...css.pareja, color: Number(res.b) > Number(res.a) && res.a !== "" ? "#D8F542" : "#E8EEF2" }}>
                                {pb.map((i) => nameOf(fecha.player_ids[i])).join(" / ")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div style={{ ...css.card, alignSelf: "start", position: "sticky", top: 10 }}>
                    <div style={css.rondaTitulo}>POSICIONES DE LA FECHA</div>
                    <table style={css.tabla}>
                      <thead><tr>
                        {["#", "Jugador", "PJ", "PG", "Dif", "Pts", "Bon"].map((h) => <th key={h} style={css.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {orden.map((id, i) => {
                          const s = stats[id];
                          const bon = fecha.bonuses?.[id] || 0;
                          return (
                            <tr key={id} style={i < 3 ? { background: "#18220F" } : {}}>
                              <td style={{ ...css.td, color: i < 3 ? "#D8F542" : "#8FA3B0" }}>{i + 1}</td>
                              <td style={{ ...css.td, textAlign: "left" }}>{nameOf(id)}</td>
                              <td style={css.td}>{s.pj}</td>
                              <td style={css.td}>{s.pg}</td>
                              <td style={css.td}>{s.gf - s.gc > 0 ? "+" : ""}{s.gf - s.gc}</td>
                              <td style={{ ...css.td, fontWeight: 700 }}>{s.pts}</td>
                              <td style={{ ...css.td, color: bon ? "#D8F542" : "#3D4E5A" }}>{bon || "–"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!fecha.closed && <p style={{ color: "#5A6E7C", fontSize: 12, margin: "10px 0 0" }}>El bonus (5/3/2) se asigna al cerrar la fecha. Desempate: diferencial de games.</p>}
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ------- TABLA GENERAL ------- */}
          {tab === "general" && (
            <section style={css.card}>
              <div style={css.rondaTitulo}>TABLA GENERAL · {torneo.name.toUpperCase()}</div>
              {misJugadores.length === 0 ? <p style={css.vacio}>Cargá jugadores para ver la tabla.</p> : (
                <table style={css.tabla}>
                  <thead><tr>
                    {["#", "Jugador", "PJ", "PG", "Dif", "Pts", "Bonus", "TOTAL"].map((h) => <th key={h} style={css.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {tablaGeneral().map((r, i) => (
                      <tr key={r.id} style={i % 2 ? { background: "#10181F" } : {}}>
                        <td style={{ ...css.td, color: "#8FA3B0" }}>{i + 1}</td>
                        <td style={{ ...css.td, textAlign: "left" }}>{nameOf(r.id)}</td>
                        <td style={css.td}>{r.pj}</td>
                        <td style={css.td}>{r.pg}</td>
                        <td style={css.td}>{r.gf - r.gc > 0 ? "+" : ""}{r.gf - r.gc}</td>
                        <td style={css.td}>{r.pts}</td>
                        <td style={{ ...css.td, color: r.bonus ? "#D8F542" : "#3D4E5A" }}>{r.bonus || "–"}</td>
                        <td style={{ ...css.td, fontWeight: 800, fontSize: 15, color: "#D8F542" }}>{r.pts + r.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Estilos ----------
const css = {
  page: { minHeight: "100vh", background: "#0B1218", color: "#E8EEF2", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "18px 14px 60px", maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 14 },
  logoBall: { width: 42, height: 42, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #EDFF7A, #C6E026 70%)", boxShadow: "0 0 24px rgba(216,245,66,.35)", flexShrink: 0 },
  h1: { margin: 0, fontSize: 24, letterSpacing: 3, fontWeight: 900 },
  sub: { margin: "2px 0 0", color: "#8FA3B0", fontSize: 13 },
  barraTorneos: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 },
  chipTorneo: { background: "#131C24", border: "1px solid #22303B", borderRadius: 20, padding: "8px 18px", color: "#8FA3B0", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  chipTorneoActivo: { background: "#1C2A16", border: "1px solid #D8F542", color: "#D8F542" },
  btnMini: { background: "#131C24", border: "1px solid #22303B", borderRadius: 8, color: "#8FA3B0", padding: "8px 10px", cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  tabs: { display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid #1B2833", flexWrap: "wrap" },
  tab: { background: "none", border: "none", color: "#8FA3B0", padding: "10px 14px", fontSize: 14, cursor: "pointer", borderBottom: "2px solid transparent", fontWeight: 600, fontFamily: "inherit" },
  tabActiva: { color: "#D8F542", borderBottom: "2px solid #D8F542" },
  card: { background: "#131C24", border: "1px solid #1B2833", borderRadius: 10, padding: 16 },
  input: { background: "#0E151C", border: "1px solid #22303B", borderRadius: 8, color: "#E8EEF2", padding: "10px 12px", fontSize: 14, fontFamily: "inherit" },
  btnPrimario: { background: "#D8F542", color: "#0B1218", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 800, cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  btnSecundario: { background: "#1B2833", color: "#E8EEF2", border: "1px solid #2A3B48", borderRadius: 8, padding: "10px 14px", cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  btnPeligro: { background: "none", color: "#E85D5D", border: "1px solid #4A2626", borderRadius: 8, padding: "10px 14px", cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  btnX: { background: "none", border: "none", color: "#5A6E7C", fontSize: 18, cursor: "pointer", padding: "0 4px" },
  vacio: { color: "#5A6E7C", fontStyle: "italic" },
  aviso: { background: "#2A2410", border: "1px solid #E8B85D", color: "#E8B85D", borderRadius: 8, padding: "10px 14px", fontSize: 14, marginBottom: 14 },
  gridJugadores: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 },
  chipJugador: { display: "flex", alignItems: "center", gap: 8, background: "#0E151C", border: "1px solid #22303B", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" },
  numChip: { color: "#5A6E7C", fontSize: 12, minWidth: 18, fontVariantNumeric: "tabular-nums" },
  filaFecha: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#131C24", border: "1px solid #1B2833", borderRadius: 10, padding: "14px 16px", color: "#E8EEF2", cursor: "pointer", width: "100%", fontFamily: "inherit", fontSize: 14 },
  badge: { borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  layoutFecha: { display: "grid", gridTemplateColumns: "1fr", gap: 14 },
  rondaTitulo: { fontSize: 12, letterSpacing: 2.5, color: "#6FB8E8", fontWeight: 800, marginBottom: 10 },
  partido: { display: "grid", gridTemplateColumns: "28px 1fr 44px 12px 44px 1fr", alignItems: "center", gap: 6, padding: "6px 0", borderTop: "1px solid #1B2833" },
  partidoEdit: { display: "grid", gridTemplateColumns: "28px 1fr 1fr 24px 1fr 1fr", alignItems: "center", gap: 5, padding: "6px 0", borderTop: "1px solid #1B2833" },
  select: { background: "#0E151C", border: "1px solid #22303B", borderRadius: 6, color: "#E8EEF2", padding: "8px 4px", fontSize: 13, fontFamily: "inherit", width: "100%" },
  cancha: { color: "#3D4E5A", fontSize: 11, fontWeight: 700 },
  pareja: { fontSize: 13, lineHeight: 1.2 },
  score: { width: 44, textAlign: "center", background: "#0E151C", border: "1px solid #22303B", borderRadius: 6, color: "#D8F542", fontSize: 16, fontWeight: 800, padding: "8px 0", fontVariantNumeric: "tabular-nums" },
  tabla: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { color: "#5A6E7C", fontSize: 11, letterSpacing: 1, textAlign: "center", padding: "6px 6px", borderBottom: "1px solid #22303B" },
  td: { textAlign: "center", padding: "8px 6px", borderBottom: "1px solid #16202A", fontVariantNumeric: "tabular-nums" },
};
