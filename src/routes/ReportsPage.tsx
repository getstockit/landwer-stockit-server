import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import { reportApi, authApi, locationApi } from '../api';

type Tab = 'current' | 'history';
type QuickRange = 'today' | 'yesterday' | 'week' | 'last7' | 'month' | 'last30' | 'custom';

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

function rangeFor(preset: QuickRange): { start: string; end: string } {
  const now = new Date();
  const today = toDateStr(now);
  switch (preset) {
    case 'today': return { start: today, end: today };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: toDateStr(y), end: toDateStr(y) }; }
    case 'week': { const d = new Date(now); const day = (d.getDay() + 7) % 7; d.setDate(d.getDate() - day); return { start: toDateStr(d), end: today }; }
    case 'last7': { const d = new Date(now); d.setDate(d.getDate() - 6); return { start: toDateStr(d), end: today }; }
    case 'month': { const d = new Date(now.getFullYear(), now.getMonth(), 1); return { start: toDateStr(d), end: today }; }
    case 'last30': { const d = new Date(now); d.setDate(d.getDate() - 29); return { start: toDateStr(d), end: today }; }
    default: return { start: today, end: today };
  }
}

const QUICK_RANGES: { key: QuickRange; label: string }[] = [
  { key: 'today', label: 'היום' },
  { key: 'yesterday', label: 'אתמול' },
  { key: 'week', label: 'השבוע' },
  { key: 'last7', label: '7 ימים' },
  { key: 'month', label: 'החודש' },
  { key: 'last30', label: '30 יום' },
];

const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('current');
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Filters
  const [preset, setPreset] = useState<QuickRange>('week');
  const [startDate, setStartDate] = useState(rangeFor('week').start);
  const [endDate, setEndDate] = useState(rangeFor('week').end);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState<'all' | 'in' | 'out' | 'delivery'>('all');
  const [shift, setShift] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [userId, setUserId] = useState('all');
  const [locationId, setLocationId] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  const loadCurrent = () => reportApi.current().then(r => setCurrent(r.data));
  const loadHistory = () => {
    setHistoryLoading(true);
    return reportApi.history({
      startDate, endDate,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      type, shift, userId, locationId,
    }).then(r => setHistory(r.data)).finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    Promise.all([loadCurrent(), loadHistory(), authApi.listUsers(), locationApi.getAll()])
      .then(([, , u, l]) => { setUsers(u.data); setLocations(l.data); })
      .finally(() => setLoading(false));
  }, []);

  const applyPreset = (p: QuickRange) => {
    setPreset(p);
    const r = rangeFor(p);
    setStartDate(r.start); setEndDate(r.end);
  };

  const fmt = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  const filteredMovements = useMemo(() => {
    if (!history) return [];
    if (!productSearch.trim()) return history.movements;
    return history.movements.filter((m: any) => m.productName.includes(productSearch.trim()));
  }, [history, productSearch]);

  if (loading) return <AppShell title="דוחות"><div className="spinner" style={{ marginTop: 60 }} /></AppShell>;

  return (
    <AppShell title="דוחות">
      {/* Admin quick links */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        <button onClick={() => navigate('/products')} style={{ flex: '1 0 auto', padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>🛠 מוצרים ומק"טים</button>
        <button onClick={() => navigate('/barcodes')} style={{ flex: '1 0 auto', padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>🏷 ברקודים</button>
        <button onClick={() => navigate('/team')} style={{ flex: '1 0 auto', padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>👥 צוות</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={tab === 'current' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ flex: 1 }} onClick={() => setTab('current')}>📊 שווי מלאי כעת</button>
        <button className={tab === 'history' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ flex: 1 }} onClick={() => setTab('history')}>📅 תנועות לפי תאריך</button>
      </div>

      {/* ───────────── CURRENT VALUE (money only) ───────────── */}
      {tab === 'current' && current && (
        <>
          <div className="card" style={{ textAlign: 'center', marginBottom: 18, padding: '22px 14px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#16A34A' }}>{fmt(current.totalValue)}</div>
            <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>שווי מלאי כולל · {current.productCount} מוצרים</div>
          </div>

          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 8 }}>שווי לפי מיקום</div>
          <div className="card" style={{ padding: 0 }}>
            {Object.values(current.byLocation || {})
              .sort((a: any, b: any) => b.value - a.value)
              .map((loc: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: '0.86rem' }}>{loc.name}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{loc.count} מוצרים</span>
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#16A34A' }}>{fmt(loc.value)}</span>
                  </span>
                </div>
              ))}
          </div>
        </>
      )}

      {/* ───────────── HISTORY / MOVEMENTS WITH FILTERS ───────────── */}
      {tab === 'history' && (
        <>
          {/* Quick date presets */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {QUICK_RANGES.map(r => (
              <button key={r.key} onClick={() => applyPreset(r.key)} style={{
                flex: '0 0 auto', padding: '7px 14px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 600,
                border: preset === r.key ? '1.5px solid #C8102E' : '1.5px solid #E2E8F0',
                background: preset === r.key ? '#FEF2F2' : '#fff',
                color: preset === r.key ? '#C8102E' : '#64748B',
              }}>{r.label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>מתאריך</label>
              <input type="date" className="form-control" value={startDate} onChange={e => { setStartDate(e.target.value); setPreset('custom'); }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>עד תאריך</label>
              <input type="date" className="form-control" value={endDate} onChange={e => { setEndDate(e.target.value); setPreset('custom'); }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>משעה (אופציונלי)</label>
              <input type="time" className="form-control" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>עד שעה (אופציונלי)</label>
              <input type="time" className="form-control" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>סוג פעולה</label>
              <select className="form-control" value={type} onChange={e => setType(e.target.value as any)}>
                <option value="all">הכל</option>
                <option value="in">⬇️ כניסות</option>
                <option value="out">⬆️ יציאות</option>
                <option value="delivery">🚚 משלוחים</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>משמרת</label>
              <select className="form-control" value={shift} onChange={e => setShift(e.target.value as any)}>
                <option value="all">הכל</option>
                <option value="morning">🌅 בוקר</option>
                <option value="afternoon">☀️ צהריים</option>
                <option value="evening">🌙 ערב</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>עובד/ת</label>
              <select className="form-control" value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="all">כולם</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>מיקום</label>
              <select className="form-control" value={locationId} onChange={e => setLocationId(e.target.value)}>
                <option value="all">הכל</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          <input className="form-control" placeholder="🔍 סינון לפי שם מוצר..." value={productSearch} onChange={e => setProductSearch(e.target.value)} style={{ marginBottom: 12 }} />

          <button className="btn btn-primary" style={{ width: '100%', marginBottom: 18 }} onClick={loadHistory} disabled={historyLoading}>
            {historyLoading ? 'טוען...' : '🔍 החל סינון'}
          </button>

          {history && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
                <div className="card" style={{ textAlign: 'center', padding: '12px 6px' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#16A34A' }}>{fmt(history.summary.totalIn)}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>כניסות ({history.summary.countIn})</div>
                </div>
                <div className="card" style={{ textAlign: 'center', padding: '12px 6px' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#DC2626' }}>{fmt(history.summary.totalOut)}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>יציאות ({history.summary.countOut})</div>
                </div>
                <div className="card" style={{ textAlign: 'center', padding: '12px 6px' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#2563EB' }}>{fmt(history.summary.totalDelivery)}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>משלוחים ({history.summary.countDelivery})</div>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 8 }}>לפי משמרת</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
                {[['morning','🌅 בוקר'],['afternoon','☀️ צהריים'],['evening','🌙 ערב']].map(([key,label]) => {
                  const s = history.summary.byShift[key];
                  return (
                    <div key={key} className="card" style={{ textAlign: 'center', padding: '10px 4px' }}>
                      <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{fmt(s.value)}</div>
                      <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{s.count} פעולות</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 8 }}>לפי עובד/ת</div>
              <div className="card" style={{ padding: 0, marginBottom: 18 }}>
                {Object.entries(history.summary.byUser || {})
                  .sort((a: any, b: any) => b[1].value - a[1].value)
                  .map(([name, s]: [string, any], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ fontSize: '0.86rem' }}>{name}</span>
                      <span style={{ fontSize: '0.82rem', color: '#64748B' }}>{s.count} פעולות · {fmt(s.value)}</span>
                    </div>
                  ))}
                {Object.keys(history.summary.byUser || {}).length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>אין תנועות בטווח/סינון הזה</div>
                )}
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 8 }}>לפי מיקום</div>
              <div className="card" style={{ padding: 0, marginBottom: 18 }}>
                {Object.values(history.summary.byLocation || {})
                  .sort((a: any, b: any) => b.value - a.value)
                  .map((l: any, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ fontSize: '0.86rem' }}>{l.name}</span>
                      <span style={{ fontSize: '0.82rem', color: '#64748B' }}>{l.count} פעולות · {fmt(l.value)}</span>
                    </div>
                  ))}
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginBottom: 8 }}>יומן פעולות ({filteredMovements.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredMovements.slice(0, 100).map((m: any) => (
                  <div key={m.id} className="card" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1rem' }}>{m.type === 'in' ? '⬇️' : m.type === 'out' ? '⬆️' : '🚚'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{m.productName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{m.userName} · {m.locationName} · {m.shiftHe} · {new Date(m.createdAt).toLocaleString('he-IL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
                    </div>
                    <div style={{ textAlign: 'left', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: m.type === 'out' ? '#DC2626' : '#16A34A', fontSize: '0.86rem' }}>
                        {m.type === 'out' ? '-' : '+'}{m.quantity}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{fmt(m.totalValue)}</div>
                    </div>
                  </div>
                ))}
                {filteredMovements.length === 0 && (
                  <div className="empty-state"><div className="empty-icon">📭</div><h3 style={{ color: '#64748B' }}>אין תנועות תואמות</h3></div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
};

export default ReportsPage;
