// Timetable Generator — 5-tab admin UI (connected to real API)
var { useState, useEffect, useCallback, useRef } = React;

const TT_BASE = "/v1/admin/timetable";

// Day and constraint type labels
const DAY_NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];
const CONSTRAINT_LABELS = {
  no_overlap_teacher: "No teacher overlap",
  no_overlap_section: "No section overlap",
  no_overlap_room: "No room double-booking",
  room_type_match: "Room type must match course type",
  weekly_count: "Weekly class count",
  max_classes_per_day: "Max classes per day (per teacher)",
  consecutive_limit: "Max consecutive slots",
  off_day: "Teacher off-day",
  friday_excluded: "Friday never scheduled",
  teacher_credit_band: "Teacher credit band",
  pref_slot_reward: "Preferred slot reward",
  gap_minimize: "Minimize teacher gaps",
  online_penalty: "Penalize online rooms",
  adjacent_lab: "Adjacent lab groups preferred",
};
const SECTION_COLORS = [
  "#4A6B5C","#B8893A","#C44536","#3B6EA5","#7B5EA7","#2E8B8B",
  "#D4782A","#5A8A3C","#A53B5E","#3B7A8A",
];

// ── UniTimetable root ─────────────────────────────────────────────────────────
function UniTimetable({ onGo }) {
  const [tab, setTab] = useState(0);
  const tabs = ["Data", "Rules", "Generate", "Grid", "Publish"];

  return (
    <>
      <PageHeader
        title="Timetable Generator"
        bn="ক্লাস সময়সূচী তৈরি করুন"
        description="Generate a conflict-free class routine using CP-SAT solver, manually adjust cells, and publish to students."
      />

      {/* Tab strip */}
      <div className="flex items-center gap-0.5 mb-6 border-b hair-b">
        {tabs.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2.5 text-[13px] -mb-px border-b-2 transition ${
              tab === i
                ? "border-[var(--sage)] text-[var(--sage)] font-medium"
                : "border-transparent text-[var(--graphite)] hover:text-[var(--ink)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <TimetableData />}
      {tab === 1 && <TimetableRules onGo={() => setTab(2)} />}
      {tab === 2 && <TimetableGenerate onSolved={() => setTab(3)} />}
      {tab === 3 && <TimetableGrid />}
      {tab === 4 && <TimetablePublish onGo={onGo} />}
    </>
  );
}

// ── Tab 0: Data ───────────────────────────────────────────────────────────────
function TimetableData() {
  const [sub, setSub] = useState("courses");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef();

  const subTabs = ["courses", "rooms", "faculty", "batches", "offerings", "eligibility"];

  async function load() {
    setLoading(true);
    try {
      const data = await AnchorAPI.apiGet(`${TT_BASE}/${sub}`);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); setShowAdd(false); setImportMsg(""); }, [sub]);

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await fetch(
        `http://localhost:8000${TT_BASE}/import?entity=${sub}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("anchor_admin_access_token")}` },
          body: fd,
        }
      ).then(r => r.json());
      setImportMsg(`Imported ${result.created} rows${result.errors.length ? ` · ${result.errors.length} errors` : ""}`);
      load();
    } catch {
      setImportMsg("Import failed");
    }
    fileRef.current.value = "";
  }

  const subTabLabels = { courses: "Courses", rooms: "Rooms", faculty: "Faculty", batches: "Batches", offerings: "Offerings", eligibility: "Eligibility" };

  return (
    <Card noPad>
      {/* Sub-tab strip */}
      <div className="flex items-center gap-0.5 px-3 pt-2 hair-b">
        {subTabs.map(t => (
          <button key={t} onClick={() => setSub(t)}
            className={`px-3 py-2 text-[12.5px] -mb-px border-b-2 ${sub === t ? "border-[var(--sage)] text-[var(--sage)] font-medium" : "border-transparent text-[var(--graphite)] hover:text-[var(--ink)]"}`}>
            {subTabLabels[t]}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 mb-1.5">
          {importMsg && <span className="text-[11px] text-[var(--sage)]">{importMsg}</span>}
          {(sub === "courses" || sub === "rooms") && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImport} />
              <GhostButton size="sm" icon="upload" onClick={() => fileRef.current.click()}>Import</GhostButton>
            </>
          )}
          <PrimaryButton size="sm" icon="plus" mode="sage" onClick={() => setShowAdd(true)}>Add</PrimaryButton>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-[var(--muted)] text-[13px]">Loading…</div>
      ) : (
        <DataEntityTable sub={sub} items={items} onRefresh={load} />
      )}

      {showAdd && (
        <AddEntitySlideOver sub={sub} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />
      )}
    </Card>
  );
}

function DataEntityTable({ sub, items, onRefresh }) {
  async function del(url) {
    if (!confirm("Delete this item?")) return;
    await AnchorAPI.apiDelete(url);
    onRefresh();
  }

  if (sub === "courses") return (
    <DataTable
      columns={[
        { key: "code", label: "Code", render: r => <MonoChip>{r.code}</MonoChip> },
        { key: "name", label: "Course name" },
        { key: "credits", label: "Cr.", align: "right" },
        { key: "is_lab", label: "Type", render: r => <Tag tone={r.is_lab ? "gold" : "sage"}>{r.is_lab ? "Lab" : "Theory"}</Tag> },
        { key: "weekly_classes", label: "Classes/wk", align: "right" },
        { key: "", label: "", render: r => <button onClick={() => del(`${TT_BASE}/courses/${r.id}`)} className="text-[var(--muted)] hover:text-[var(--red)]"><Icon name="trash-2" size={13} /></button> },
      ]}
      rows={items}
    />
  );

  if (sub === "rooms") return (
    <DataTable
      columns={[
        { key: "name", label: "Room", render: r => <MonoChip>{r.name}</MonoChip> },
        { key: "room_type", label: "Type", render: r => <Tag tone={r.room_type === "LAB" ? "gold" : r.room_type === "ONLINE" ? "mist" : "sage"}>{r.room_type}</Tag> },
        { key: "capacity", label: "Capacity", align: "right" },
        { key: "", label: "", render: r => <button onClick={() => del(`${TT_BASE}/rooms/${r.id}`)} className="text-[var(--muted)] hover:text-[var(--red)]"><Icon name="trash-2" size={13} /></button> },
      ]}
      rows={items}
    />
  );

  if (sub === "faculty") return (
    <DataTable
      columns={[
        { key: "id", label: "Faculty ID", render: r => <MonoChip>{String(r.id).slice(0, 8)}</MonoChip> },
        { key: "rank", label: "Rank" },
        { key: "max_per_day", label: "Max/day", align: "right" },
        { key: "active", label: "Active", render: r => <Tag tone={r.active ? "sage" : "mist"}>{r.active ? "Active" : "Off"}</Tag> },
        { key: "", label: "", render: r => <button onClick={() => del(`${TT_BASE}/faculty/${r.id}`)} className="text-[var(--muted)] hover:text-[var(--red)]"><Icon name="trash-2" size={13} /></button> },
      ]}
      rows={items}
    />
  );

  if (sub === "batches") return (
    <div className="p-4 space-y-3">
      {items.length === 0 && <div className="text-[var(--muted)] text-[13px]">No batches yet.</div>}
      {items.map(b => (
        <div key={b.id} className="hair border rounded-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-medium text-[13px]">{b.name}</span>
              <span className="ml-2 text-[11px] text-[var(--muted)]">{b.program}</span>
            </div>
            <GenerateSectionsButton batchId={b.id} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(b.sections || []).map(s => (
              <span key={s.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 hair border rounded-sm font-mono">
                {s.name}
                {(s.lab_groups || []).map(lg => (
                  <span key={lg.id} className="text-[var(--muted)]">/{lg.name}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (sub === "offerings") return (
    <DataTable
      columns={[
        { key: "term_id", label: "Term", render: r => <MonoChip>{String(r.term_id).slice(0, 8)}</MonoChip> },
        { key: "course_id", label: "Course", render: r => <MonoChip>{String(r.course_id).slice(0, 8)}</MonoChip> },
        { key: "batch_id", label: "Batch", render: r => <MonoChip>{String(r.batch_id).slice(0, 8)}</MonoChip> },
        { key: "", label: "", render: r => <button onClick={() => del(`${TT_BASE}/offerings/${r.id}`)} className="text-[var(--muted)] hover:text-[var(--red)]"><Icon name="trash-2" size={13} /></button> },
      ]}
      rows={items}
    />
  );

  if (sub === "eligibility") return (
    <DataTable
      columns={[
        { key: "faculty_id", label: "Faculty", render: r => <MonoChip>{String(r.faculty_id).slice(0, 8)}</MonoChip> },
        { key: "course_id", label: "Course", render: r => <MonoChip>{String(r.course_id).slice(0, 8)}</MonoChip> },
        { key: "", label: "", render: r => <button onClick={() => del(`${TT_BASE}/eligibility/${r.id}`)} className="text-[var(--muted)] hover:text-[var(--red)]"><Icon name="trash-2" size={13} /></button> },
      ]}
      rows={items}
    />
  );

  return null;
}

function GenerateSectionsButton({ batchId }) {
  const [count, setCount] = useState(3);
  const [open, setOpen] = useState(false);
  async function gen() {
    await AnchorAPI.apiPostAuth(`${TT_BASE}/batches/${batchId}/generate-structure`, { count, lab_split: true });
    setOpen(false);
    window.location.reload();
  }
  if (!open) return <GhostButton size="sm" icon="plus" onClick={() => setOpen(true)}>Generate sections</GhostButton>;
  return (
    <div className="flex items-center gap-2">
      <input type="number" min="1" max="26" value={count} onChange={e => setCount(+e.target.value)}
        className="w-14 px-2 py-1 hair border rounded-sm text-[12px] font-mono" />
      <GhostButton size="sm" onClick={gen}>Create</GhostButton>
      <GhostButton size="sm" onClick={() => setOpen(false)}>Cancel</GhostButton>
    </div>
  );
}

function AddEntitySlideOver({ sub, onClose, onDone }) {
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    try {
      const endpoints = {
        courses: `${TT_BASE}/courses`,
        rooms: `${TT_BASE}/rooms`,
        faculty: `${TT_BASE}/faculty`,
        batches: `${TT_BASE}/batches`,
        offerings: `${TT_BASE}/offerings`,
        eligibility: `${TT_BASE}/eligibility`,
      };
      await AnchorAPI.apiPostAuth(endpoints[sub], form);
      onDone();
    } catch (e) {
      setErr(e.message || "Failed");
    }
  }

  const fields = {
    courses: [
      { k: "code", label: "Code", placeholder: "SE223" },
      { k: "name", label: "Course name", placeholder: "Algorithms" },
      { k: "credits", label: "Credits", type: "number", placeholder: "3" },
      { k: "weekly_classes", label: "Classes/week", type: "number", placeholder: "2" },
      { k: "is_lab", label: "Is lab?", type: "checkbox" },
    ],
    rooms: [
      { k: "name", label: "Room", placeholder: "KT-504" },
      { k: "room_type", label: "Type", type: "select", opts: ["THEORY", "LAB", "ONLINE"] },
      { k: "capacity", label: "Capacity", type: "number", placeholder: "30" },
    ],
    faculty: [
      { k: "user_id", label: "User ID (UUID)", placeholder: "user-uuid-here" },
      { k: "rank", label: "Rank", type: "select", opts: ["LECTURER","SENIOR_LECTURER","ASSISTANT_PROF","ASSOCIATE_PROF","PROFESSOR","HOD","PHD_STUDENT","MASTERS_STUDENT"] },
      { k: "max_per_day", label: "Max classes/day", type: "number", placeholder: "4" },
    ],
    batches: [
      { k: "name", label: "Batch name", placeholder: "Batch 41" },
      { k: "program", label: "Program", placeholder: "SWE" },
    ],
    offerings: [
      { k: "term_id", label: "Term ID (UUID)", placeholder: "term-uuid" },
      { k: "course_id", label: "Course ID (UUID)", placeholder: "course-uuid" },
      { k: "batch_id", label: "Batch ID (UUID)", placeholder: "batch-uuid" },
    ],
    eligibility: [
      { k: "faculty_id", label: "Faculty ID (UUID)", placeholder: "faculty-uuid" },
      { k: "course_id", label: "Course ID (UUID)", placeholder: "course-uuid" },
    ],
  };

  return (
    <SlideOver title={`Add ${sub.slice(0, -1)}`} onClose={onClose}>
      <div className="space-y-4">
        {(fields[sub] || []).map(f => (
          <div key={f.k}>
            <label className="smallcaps text-[var(--muted)] mb-1 block">{f.label}</label>
            {f.type === "select" ? (
              <select className="w-full px-2 py-1.5 hair border rounded-sm bg-white text-[13px]"
                onChange={e => set(f.k, e.target.value)}>
                <option value="">Select…</option>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "checkbox" ? (
              <input type="checkbox" className="accent-[var(--sage)]"
                onChange={e => set(f.k, e.target.checked)} />
            ) : (
              <input type={f.type || "text"} placeholder={f.placeholder}
                className="w-full px-2 py-1.5 hair border rounded-sm bg-white text-[13px]"
                onChange={e => set(f.k, f.type === "number" ? +e.target.value : e.target.value)} />
            )}
          </div>
        ))}
        {err && <div className="text-[var(--red)] text-[12px]">{err}</div>}
        <PrimaryButton mode="sage" onClick={submit} className="w-full justify-center">Add</PrimaryButton>
      </div>
    </SlideOver>
  );
}

// ── Tab 1: Rules ──────────────────────────────────────────────────────────────
function TimetableRules({ onGo }) {
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [constraints, setConstraints] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    AnchorAPI.apiGet(`${TT_BASE}/terms`).then(d => setTerms(d)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!termId) return;
    AnchorAPI.apiGet(`${TT_BASE}/constraints?term_id=${termId}`)
      .then(d => setConstraints(d)).catch(() => setConstraints([]));
  }, [termId]);

  async function toggle(con) {
    await AnchorAPI.apiPatch(`${TT_BASE}/constraints/${con.id}`, { enabled: !con.enabled });
    setConstraints(cs => cs.map(c => c.id === con.id ? { ...c, enabled: !c.enabled } : c));
  }

  async function updateWeight(con, w) {
    await AnchorAPI.apiPatch(`${TT_BASE}/constraints/${con.id}`, { weight: w });
    setConstraints(cs => cs.map(c => c.id === con.id ? { ...c, weight: w } : c));
  }

  async function del(con) {
    if (!confirm("Delete constraint?")) return;
    await AnchorAPI.apiDelete(`${TT_BASE}/constraints/${con.id}`);
    setConstraints(cs => cs.filter(c => c.id !== con.id));
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--muted)]">Term</span>
            <select className="hair border rounded-sm bg-white px-2 py-1 text-[13px]"
              value={termId} onChange={e => setTermId(e.target.value)}>
              <option value="">Select term…</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          {termId && (
            <PrimaryButton size="sm" icon="plus" mode="sage" onClick={() => setShowAdd(true)}>
              Add rule
            </PrimaryButton>
          )}
        </div>
      </Card>

      {constraints.length === 0 && termId && (
        <Card className="text-center text-[var(--muted)] text-[13px] py-8">
          No constraints yet. Add rules to guide the solver.
        </Card>
      )}

      {constraints.map(con => (
        <Card key={con.id} noPad>
          <div className="p-3 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-[13px]">{CONSTRAINT_LABELS[con.constraint_type] || con.constraint_type}</span>
                <Tag tone={con.enforcement === "hard" ? "red" : "gold"}>{con.enforcement}</Tag>
                {!con.enabled && <Tag tone="mist">disabled</Tag>}
              </div>
              {Object.keys(con.params).length > 0 && (
                <div className="text-[11.5px] text-[var(--muted)] mt-0.5 font-mono">
                  {JSON.stringify(con.params)}
                </div>
              )}
              {con.enforcement === "soft" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-[var(--muted)]">Weight</span>
                  <input type="range" min="1" max="100" value={con.weight || 10}
                    className="accent-[var(--sage)]"
                    onChange={e => updateWeight(con, +e.target.value)} />
                  <span className="font-mono text-[11px] text-[var(--ink)] w-6 text-right">{con.weight || 10}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggle(con)}
                className={`w-8 h-4 rounded-full transition relative ${con.enabled ? "bg-[var(--sage)]" : "bg-[var(--mist)]"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${con.enabled ? "left-4.5" : "left-0.5"}`} style={{ left: con.enabled ? "calc(100% - 14px)" : "2px" }} />
              </button>
              <button onClick={() => del(con)} className="text-[var(--muted)] hover:text-[var(--red)]">
                <Icon name="trash-2" size={13} />
              </button>
            </div>
          </div>
        </Card>
      ))}

      {showAdd && termId && (
        <AddConstraintSlideOver
          termId={termId}
          onClose={() => setShowAdd(false)}
          onDone={con => { setConstraints(cs => [...cs, con]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

function AddConstraintSlideOver({ termId, onClose, onDone }) {
  const [type, setType] = useState("max_classes_per_day");
  const [enforcement, setEnforcement] = useState("hard");
  const [weight, setWeight] = useState(10);
  const [paramStr, setParamStr] = useState('{"limit": 4}');
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    let params;
    try { params = JSON.parse(paramStr); } catch { setErr("Invalid JSON in params"); return; }
    try {
      const con = await AnchorAPI.apiPostAuth(`${TT_BASE}/constraints`, {
        constraint_type: type,
        scope: {},
        params,
        enforcement,
        weight: enforcement === "soft" ? weight : null,
        term_id: termId,
      });
      onDone(con);
    } catch (e) {
      setErr(e.message || "Failed");
    }
  }

  return (
    <SlideOver title="Add constraint rule" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="smallcaps text-[var(--muted)] mb-1 block">Constraint type</label>
          <select className="w-full px-2 py-1.5 hair border rounded-sm bg-white text-[13px]"
            value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(CONSTRAINT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="smallcaps text-[var(--muted)] mb-1 block">Enforcement</label>
          <div className="flex gap-3">
            {["hard", "soft"].map(e => (
              <label key={e} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                <input type="radio" name="enforcement" value={e} checked={enforcement === e}
                  onChange={() => setEnforcement(e)} className="accent-[var(--sage)]" />
                {e}
              </label>
            ))}
          </div>
        </div>
        {enforcement === "soft" && (
          <div>
            <label className="smallcaps text-[var(--muted)] mb-1 block">Weight</label>
            <input type="range" min="1" max="100" value={weight}
              className="w-full accent-[var(--sage)]" onChange={e => setWeight(+e.target.value)} />
            <div className="text-[11px] font-mono text-right text-[var(--muted)]">{weight}</div>
          </div>
        )}
        <div>
          <label className="smallcaps text-[var(--muted)] mb-1 block">Params (JSON)</label>
          <textarea rows={3} value={paramStr} onChange={e => setParamStr(e.target.value)}
            className="w-full px-2 py-1.5 hair border rounded-sm bg-white text-[12px] font-mono resize-none" />
        </div>
        {err && <div className="text-[var(--red)] text-[12px]">{err}</div>}
        <PrimaryButton mode="sage" onClick={submit} className="w-full justify-center">Add rule</PrimaryButton>
      </div>
    </SlideOver>
  );
}

// ── Tab 2: Generate ───────────────────────────────────────────────────────────
function TimetableGenerate({ onSolved }) {
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [timeLimit, setTimeLimit] = useState(60);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    AnchorAPI.apiGet(`${TT_BASE}/terms`).then(d => {
      setTerms(d);
      const active = d.find(t => t.is_active);
      if (active) setTermId(active.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return;
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const j = await AnchorAPI.apiGet(`${TT_BASE}/solve/${jobId}`);
        setJob(j);
        if (["optimal", "feasible", "infeasible", "failed"].includes(j.status)) {
          clearInterval(pollRef.current);
          setPolling(false);
          if (j.status === "optimal" || j.status === "feasible") {
            setTimeout(onSolved, 1200);
          }
        }
      } catch { clearInterval(pollRef.current); setPolling(false); }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  async function handleSolve() {
    if (!termId) { setErr("Select a term first"); return; }
    setErr(""); setJob(null); setJobId(null);
    try {
      const j = await AnchorAPI.apiPostAuth(`${TT_BASE}/solve`, { term_id: termId, time_limit_s: timeLimit });
      setJobId(j.job_id);
      setJob(j);
    } catch (e) {
      setErr(e.message || "Solve failed");
    }
  }

  async function handleRelaxAndResolve() {
    if (!job || !job.infeasible_core?.length) return;
    // Create soft versions of infeasible-core constraints and re-solve
    for (const conId of job.infeasible_core) {
      try {
        await AnchorAPI.apiPatch(`${TT_BASE}/constraints/${conId}`, { enforcement: "soft", weight: 50 });
      } catch {}
    }
    handleSolve();
  }

  const statusColor = { optimal: "var(--sage)", feasible: "var(--sage)", infeasible: "var(--red)", failed: "var(--red)", running: "var(--gold)", queued: "var(--muted)" };
  const isRunning = job && ["queued", "running"].includes(job.status);

  return (
    <div className="max-w-[680px] mx-auto">
      <Card className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="smallcaps text-[var(--muted)] mb-1 block">Term</label>
            <select className="w-full hair border rounded-sm bg-white px-2 py-1.5 text-[13px]"
              value={termId} onChange={e => setTermId(e.target.value)}>
              <option value="">Select term…</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? " · active" : ""}</option>)}
            </select>
          </div>
          <div className="w-48">
            <label className="smallcaps text-[var(--muted)] mb-1 block">Time limit — {timeLimit}s</label>
            <input type="range" min="10" max="300" step="10" value={timeLimit}
              className="w-full accent-[var(--sage)]" onChange={e => setTimeLimit(+e.target.value)} />
          </div>
        </div>

        {err && <div className="text-[var(--red)] text-[12px]">{err}</div>}

        <div className="flex flex-col items-center gap-4 py-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center`}
            style={{ background: isRunning ? "#F2E8D2" : "#E8EFEA" }}>
            <Icon name={isRunning ? "loader" : "cpu"} size={28}
              style={{ color: isRunning ? "var(--gold)" : "var(--sage)" }}
              className={isRunning ? "animate-spin" : ""} />
          </div>
          <div className="text-center">
            <h3 className="font-serif text-[22px] text-[var(--navy)]" style={{ fontWeight: 500 }}>
              {isRunning ? "Solving…" : "Generate schedule"}
            </h3>
            {job && (
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="font-mono text-[12px]" style={{ color: statusColor[job.status] || "var(--ink)" }}>
                  {job.status.toUpperCase()}
                </span>
                {job.result_version && (
                  <span className="text-[11px] text-[var(--muted)]">version {job.result_version}</span>
                )}
              </div>
            )}
          </div>
          <PrimaryButton mode="sage" icon={isRunning ? "loader" : "play"}
            onClick={handleSolve} disabled={isRunning || !termId}>
            {isRunning ? "Solving…" : job ? "Re-generate" : "Generate schedule"}
          </PrimaryButton>
        </div>

        {isRunning && (
          <div>
            <div className="text-[11px] text-[var(--muted)] mb-1 flex justify-between">
              <span>Solver progress</span>
              <span className="font-mono">{job?.progress || 0}%</span>
            </div>
            <div className="h-1.5 bg-[var(--mist)] rounded-sm overflow-hidden">
              <div className="h-full bg-[var(--sage)] transition-all" style={{ width: `${job?.progress || 15}%` }} />
            </div>
          </div>
        )}

        {job?.status === "infeasible" && job.infeasible_core?.length > 0 && (
          <div className="hair border rounded-sm p-3" style={{ borderColor: "var(--red)", background: "rgba(232,49,42,0.04)" }}>
            <div className="text-[var(--red)] font-medium text-[13px] mb-2 flex items-center gap-2">
              <Icon name="alert-triangle" size={14} /> Infeasible — conflicting rules
            </div>
            <div className="space-y-1 text-[12px] text-[var(--graphite)]">
              {job.infeasible_core.map(id => (
                <div key={id} className="font-mono text-[var(--muted)]">{id}</div>
              ))}
            </div>
            <GhostButton size="sm" className="mt-3" onClick={handleRelaxAndResolve}>
              Relax conflicting rules and re-solve
            </GhostButton>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab 3: Grid ───────────────────────────────────────────────────────────────
function TimetableGrid() {
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [version, setVersion] = useState(1);
  const [entries, setEntries] = useState([]);
  const [config, setConfig] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [editEntry, setEditEntry] = useState(null);
  const [nlText, setNlText] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [resolveJobId, setResolveJobId] = useState(null);
  const [prevEntries, setPrevEntries] = useState([]);
  const [diffMode, setDiffMode] = useState(false);

  useEffect(() => {
    AnchorAPI.apiGet(`${TT_BASE}/terms`).then(d => {
      setTerms(d);
      const active = d.find(t => t.is_active);
      if (active) setTermId(active.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!termId) return;
    AnchorAPI.apiGet(`${TT_BASE}/config?term_id=${termId}`).then(c => setConfig(c)).catch(() => {});
    loadEntries();
  }, [termId, version]);

  async function loadEntries() {
    if (!termId) return;
    try {
      const data = await AnchorAPI.apiGet(`${TT_BASE}/entries?term_id=${termId}&version=${version}`);
      setEntries(data);
      // Build unique sections
      const secs = [...new Map(data.map(e => [e.section_id, { id: e.section_id, name: `${e.batch_name} ${e.section_name}` }])).values()];
      setSections(secs);
      if (secs.length && !selectedSection) setSelectedSection(secs[0].id);
    } catch {
      setEntries([]);
    }
  }

  async function toggleLock(entry) {
    await AnchorAPI.apiPatch(`${TT_BASE}/entries/${entry.id}`, { lock: !entry.locked });
    setEntries(es => es.map(e => e.id === entry.id ? { ...e, locked: !e.locked } : e));
  }

  async function applyEdit(entry, newDay, newSlot, newFacultyId, newRoomId) {
    await AnchorAPI.apiPatch(`${TT_BASE}/entries/${entry.id}`, {
      new_day: newDay, new_slot: newSlot,
      new_faculty_id: newFacultyId, new_room_id: newRoomId,
      lock: true,
    });
    setEditEntry(null);
    loadEntries();
  }

  async function handleNLEdit() {
    if (!nlText.trim()) return;
    setNlLoading(true);
    try {
      const job = await AnchorAPI.apiPostAuth(`${TT_BASE}/nl-edit`, {
        term_id: termId,
        base_version: version,
        text: nlText,
      });
      setResolveJobId(job.job_id);
      pollResolve(job.job_id);
      setNlText("");
    } catch (e) {
      alert(e.message || "NL parse failed — try rephrasing or use the cell edit form");
    } finally {
      setNlLoading(false);
    }
  }

  async function handleResolve() {
    if (!entries.some(e => e.locked)) {
      alert("Lock at least one cell before re-solving to guide the solver.");
      return;
    }
    const job = await AnchorAPI.apiPostAuth(`${TT_BASE}/resolve`, {
      term_id: termId,
      base_version: version,
      change: {},
      keep_locked: true,
      time_limit_s: 60,
    });
    setResolveJobId(job.job_id);
    pollResolve(job.job_id);
  }

  function pollResolve(jId) {
    const interval = setInterval(async () => {
      const j = await AnchorAPI.apiGet(`${TT_BASE}/solve/${jId}`);
      if (["optimal", "feasible", "failed", "infeasible"].includes(j.status)) {
        clearInterval(interval);
        setResolveJobId(null);
        if (j.result_version) {
          setPrevEntries(entries);
          setDiffMode(true);
          setVersion(j.result_version);
        }
      }
    }, 2000);
  }

  const days = config?.days || DAY_NAMES;
  const slots = config?.slots || [];

  const sectionEntries = entries.filter(e => e.section_id === selectedSection);
  const colorMap = {};
  sections.forEach((s, i) => { colorMap[s.id] = SECTION_COLORS[i % SECTION_COLORS.length]; });

  // Build a lookup for the grid
  const gridMap = {};
  sectionEntries.forEach(e => { gridMap[`${e.day}-${e.slot}`] = e; });

  // Diff: which entry IDs changed?
  const changedIds = diffMode
    ? new Set(sectionEntries.filter(e => {
        const prev = prevEntries.find(p => p.course_id === e.course_id && p.section_id === e.section_id);
        return prev && (prev.day !== e.day || prev.slot !== e.slot);
      }).map(e => e.id))
    : new Set();

  const color = colorMap[selectedSection] || "var(--sage)";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--muted)]">Term</span>
            <select className="hair border rounded-sm bg-white px-2 py-1 text-[13px]"
              value={termId} onChange={e => { setTermId(e.target.value); setVersion(1); }}>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--muted)]">Version</span>
            <input type="number" min="1" value={version} onChange={e => setVersion(+e.target.value)}
              className="w-14 px-2 py-1 hair border rounded-sm text-[12px] font-mono" />
          </div>
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--muted)]">Section</span>
            <select className="hair border rounded-sm bg-white px-2 py-1 text-[13px]"
              value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          {resolveJobId && (
            <span className="text-[12px] text-[var(--gold)] flex items-center gap-1">
              <Icon name="loader" size={12} className="animate-spin" /> Re-solving…
            </span>
          )}
          {diffMode && (
            <GhostButton size="sm" icon="eye-off" onClick={() => setDiffMode(false)}>Hide diff</GhostButton>
          )}
          <GhostButton size="sm" icon="refresh-cw" onClick={handleResolve}>Re-solve</GhostButton>
        </div>
      </Card>

      {/* Grid */}
      <Card noPad>
        <div className="p-4 overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `80px repeat(${days.length}, 1fr)`, gap: "3px", minWidth: 600 }}>
            <div />
            {days.map(d => (
              <div key={d} className="smallcaps text-center text-[var(--muted)] pb-1.5 text-[11px]">{d}</div>
            ))}
            {slots.map((slot, si) => (
              <React.Fragment key={slot}>
                <div className="text-[10px] text-[var(--muted)] font-mono flex items-start pt-2">{slot}</div>
                {days.map((_, di) => {
                  const entry = gridMap[`${di}-${si}`];
                  if (!entry) return (
                    <div key={di} className="hair border border-dashed rounded-sm min-h-[60px]"
                      style={{ borderColor: "#EDEAE0", background: "#FBF9F3" }} />
                  );
                  const isChanged = changedIds.has(entry.id);
                  return (
                    <button key={di} onClick={() => setEditEntry(entry)}
                      className="text-left rounded-sm p-2 min-h-[60px] hair border relative group"
                      style={{
                        borderColor: isChanged ? "var(--gold)" : color + "33",
                        background: entry.locked ? color + "0A" : color + "12",
                        boxShadow: isChanged ? `inset 0 0 0 2px var(--gold)` : "none",
                      }}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-1 h-3 rounded-full" style={{ background: color }} />
                        <span className="font-mono text-[11px] font-medium text-[var(--ink)]">{entry.course_code}</span>
                        {entry.locked && <Icon name="lock" size={10} style={{ color: "var(--gold)" }} />}
                      </div>
                      <div className="text-[10.5px] text-[var(--graphite)] leading-tight truncate">{entry.faculty_name}</div>
                      <div className="text-[10px] text-[var(--muted)]">{entry.room_name}</div>
                      {entry.locked && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                          style={{ background: "var(--gold)" }} />
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 pb-4 pt-2 hair-t flex flex-wrap items-center gap-4 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)" }} /> Locked</span>
          {diffMode && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-2 border-2 rounded-sm" style={{ borderColor: "var(--gold)" }} /> Changed this re-solve</span>}
        </div>
      </Card>

      {/* NL command box */}
      <Card>
        <SectionLabel>NL command</SectionLabel>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="SE223 section A ke Monday 1st slot e niye jao…"
            value={nlText}
            onChange={e => setNlText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleNLEdit()}
            className="flex-1 px-3 py-2 hair border rounded-sm text-[13px] bg-white"
          />
          <PrimaryButton mode="sage" icon={nlLoading ? "loader" : "send"}
            disabled={nlLoading || !nlText.trim()} onClick={handleNLEdit}>
            {nlLoading ? "…" : "Send"}
          </PrimaryButton>
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-1.5">
          NL command is parsed by Ollama → re-solves with minimal perturbation.
        </div>
      </Card>

      {/* Cell edit modal */}
      {editEntry && (
        <CellEditModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onLock={() => { toggleLock(editEntry); setEditEntry(null); }}
          onApply={applyEdit}
          termId={termId}
        />
      )}
    </div>
  );
}

function CellEditModal({ entry, onClose, onLock, onApply, termId }) {
  const [rooms, setRooms] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [newDay, setNewDay] = useState(entry.day);
  const [newSlot, setNewSlot] = useState(entry.slot);
  const [newRoomId, setNewRoomId] = useState(entry.room_id);
  const [newFacultyId, setNewFacultyId] = useState(entry.faculty_id);

  useEffect(() => {
    AnchorAPI.apiGet(`${TT_BASE}/rooms`).then(setRooms).catch(() => {});
    AnchorAPI.apiGet(`${TT_BASE}/faculty`).then(setFaculty).catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center"
      style={{ background: "rgba(11,29,53,0.25)" }} onClick={onClose}>
      <div className="bg-[var(--paper)] rounded-sm w-[440px] hair border shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="p-4 hair-b flex items-center justify-between">
          <div>
            <div className="smallcaps text-[var(--muted)]">Edit slot</div>
            <h3 className="font-serif text-[20px] text-[var(--navy)]" style={{ fontWeight: 500 }}>
              {entry.course_code} · {entry.section_name}
            </h3>
          </div>
          <button onClick={onLock} className="flex items-center gap-1.5 text-[12px] px-2 py-1 hair border rounded-sm hover:bg-[var(--mist)]/40">
            <Icon name={entry.locked ? "unlock" : "lock"} size={12} />
            {entry.locked ? "Unlock" : "Lock"}
          </button>
        </div>
        <div className="p-4 space-y-3 text-[13px]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="smallcaps text-[var(--muted)] mb-1 block">Day</label>
              <select className="w-full px-2 py-1.5 hair border rounded-sm bg-white"
                value={newDay} onChange={e => setNewDay(+e.target.value)}>
                {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="smallcaps text-[var(--muted)] mb-1 block">Slot</label>
              <input type="number" min="0" value={newSlot}
                onChange={e => setNewSlot(+e.target.value)}
                className="w-full px-2 py-1.5 hair border rounded-sm bg-white" />
            </div>
          </div>
          <div>
            <label className="smallcaps text-[var(--muted)] mb-1 block">Room</label>
            <select className="w-full px-2 py-1.5 hair border rounded-sm bg-white"
              value={newRoomId} onChange={e => setNewRoomId(e.target.value)}>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.room_type})</option>)}
            </select>
          </div>
          <div>
            <label className="smallcaps text-[var(--muted)] mb-1 block">Teacher</label>
            <select className="w-full px-2 py-1.5 hair border rounded-sm bg-white"
              value={newFacultyId} onChange={e => setNewFacultyId(e.target.value)}>
              {faculty.map(f => <option key={f.id} value={f.id}>{f.rank} · {String(f.user_id).slice(0, 8)}</option>)}
            </select>
          </div>
        </div>
        <div className="p-3 hair-t flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton icon="check" mode="sage"
            onClick={() => onApply(entry, newDay, newSlot, newFacultyId, newRoomId)}>
            Apply
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ── Tab 4: Publish ────────────────────────────────────────────────────────────
function TimetablePublish({ onGo }) {
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [version, setVersion] = useState(1);
  const [validation, setValidation] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [err, setErr] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    AnchorAPI.apiGet(`${TT_BASE}/terms`).then(d => {
      setTerms(d);
      const active = d.find(t => t.is_active);
      if (active) setTermId(active.id);
    }).catch(() => {});
  }, []);

  async function runValidate() {
    if (!termId) { setErr("Select a term"); return; }
    setErr(""); setValidation(null);
    try {
      const v = await AnchorAPI.apiGet(`${TT_BASE}/validate?term_id=${termId}&version=${version}`);
      setValidation(v);
    } catch (e) {
      setErr(e.message || "Validate failed");
    }
  }

  async function handlePublish() {
    setPublishing(true); setErr("");
    try {
      const result = await AnchorAPI.apiPostAuth(`${TT_BASE}/publish`, { term_id: termId, version });
      setPublishResult(result);
      setConfirmOpen(false);
    } catch (e) {
      setErr(e.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = validation && validation.hard_count === 0;

  return (
    <div className="max-w-[680px] space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--muted)]">Term</span>
            <select className="hair border rounded-sm bg-white px-2 py-1 text-[13px]"
              value={termId} onChange={e => setTermId(e.target.value)}>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--muted)]">Version</span>
            <input type="number" min="1" value={version} onChange={e => setVersion(+e.target.value)}
              className="w-14 px-2 py-1 hair border rounded-sm text-[12px] font-mono" />
          </div>
          <GhostButton icon="shield-check" onClick={runValidate}>Run validator</GhostButton>
        </div>
      </Card>

      {err && <div className="text-[var(--red)] text-[12px] px-1">{err}</div>}

      {validation && (
        <Card>
          <SectionLabel>Validation result — version {validation.version}</SectionLabel>
          {validation.hard_count === 0 ? (
            <div className="flex items-center gap-2 text-[var(--sage)] text-[13px]">
              <Icon name="check-circle" size={14} /> No conflicts — ready to publish
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[var(--red)] text-[13px] flex items-center gap-1.5">
                <Icon name="alert-triangle" size={14} /> {validation.hard_count} conflict(s) — resolve before publishing
              </div>
              {validation.conflicts.map((c, i) => (
                <div key={i} className="hair border rounded-sm p-2.5 text-[12.5px]"
                  style={{ borderColor: "rgba(232,49,42,0.3)", background: "rgba(232,49,42,0.03)" }}>
                  <div className="font-medium">{c.conflict_type.replace(/_/g, " ")}</div>
                  <div className="text-[var(--muted)]">{c.description}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {canPublish && !publishResult && (
        <PrimaryButton mode="sage" icon="send" onClick={() => setConfirmOpen(true)}>
          Publish routine to students
        </PrimaryButton>
      )}

      {publishResult && (
        <Card>
          <div className="flex items-center gap-2 text-[var(--sage)] font-medium text-[13px] mb-2">
            <Icon name="check-circle" size={14} /> Published {publishResult.published_routines} routine(s)
          </div>
          <div className="text-[12px] text-[var(--muted)] mb-3">
            Students can now see their routine in the app under Routine Builder.
          </div>
          <GhostButton size="sm" onClick={() => onGo && onGo("/university/routine")}>
            View in Routine Builder
          </GhostButton>
        </Card>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handlePublish}
        title={`Publish version ${version}?`}
        body="This will write the timetable to the student-facing routine feed. Students with the app will be able to see their class schedule immediately."
        confirmWord="PUBLISH"
        confirmLabel={publishing ? "Publishing…" : "Publish"}
        tone="sage"
      />
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────
function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="smallcaps text-[var(--muted)]">{children}</div>
      {right}
    </div>
  );
}

Object.assign(window, { UniTimetable });
