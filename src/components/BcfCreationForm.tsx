import { useState, useEffect, useCallback } from 'react';

export interface BcfFormData {
  title: string;
  description: string;
  topic_type: string;
  priority: string;
  topic_status: string;
  assigned_to: string;
}

interface BcfExtensions {
  topic_type: string[];
  priority: string[];
  topic_status: string[];
}

const DEFAULT_BCF_EXTENSIONS: BcfExtensions = {
  topic_type: ['Issue', 'Request', 'Information'],
  priority: ['Low', 'Normal', 'High', 'Critical'],
  topic_status: ['New', 'Open', 'In Progress', 'Resolved', 'Closed'],
};

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const mergeUnique = (...lists: string[][]): string[] => {
  const values = new Set<string>();
  lists.flat().forEach((item) => {
    if (item) values.add(item);
  });
  return Array.from(values);
};

const toAppProxyBase = (proxyUrl: string) => proxyUrl.replace(/\/api\/tc\/?$/, '/api');

interface BcfCreationFormProps {
  isVisible: boolean;
  prefillData?: Partial<BcfFormData>;
  projectId: string;
  getAccessToken: () => Promise<string>;
  proxyUrl: string;
  onSubmit: (data: BcfFormData) => void | Promise<void>;
  onCancel: () => void;
}

export default function BcfCreationForm({
  isVisible,
  prefillData,
  projectId,
  getAccessToken,
  proxyUrl,
  onSubmit,
  onCancel,
}: BcfCreationFormProps) {
  const [formData, setFormData] = useState<BcfFormData>({
    title: '',
    description: '',
    topic_type: '',
    priority: '',
    topic_status: '',
    assigned_to: '',
  });

  const [extensions, setExtensions] = useState<BcfExtensions>({ topic_type: [], priority: [], topic_status: [] });
  const [members, setMembers] = useState<{ id: string; email: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [optionsWarning, setOptionsWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    setFormData({
      title: prefillData?.title ?? '',
      description: prefillData?.description ?? '',
      topic_type: prefillData?.topic_type ?? '',
      priority: prefillData?.priority ?? '',
      topic_status: prefillData?.topic_status ?? '',
      assigned_to: prefillData?.assigned_to ?? '',
    });
  }, [isVisible, prefillData]);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    setLoading(true);

    const fetchData = async () => {
      try {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };
        const appProxyBase = toAppProxyBase(proxyUrl);

        const [extResp, membersResp, appMembersResp, currentUserResp, topicsResp] = await Promise.all([
          fetch(`${appProxyBase}/projects/${projectId}/bcf/extensions`, { headers }).catch(() => null),
          fetch(`${proxyUrl}/projects/${projectId}/users`, { headers }).catch(() => null),
          fetch(`${appProxyBase}/projects/${projectId}/users`, { headers }).catch(() => null),
          fetch(`${proxyUrl}/users/me`, { headers }).catch(() => null),
          fetch(`${appProxyBase}/projects/${projectId}/bcf/topics`, { headers }).catch(() => null),
        ]);

        if (cancelled) return;

        let nextExtensions = DEFAULT_BCF_EXTENSIONS;
        if (extResp?.ok) {
          const ext = await extResp.json();
          nextExtensions = {
            topic_type: mergeUnique(normalizeList(ext.topic_type), DEFAULT_BCF_EXTENSIONS.topic_type),
            priority: mergeUnique(normalizeList(ext.priority), DEFAULT_BCF_EXTENSIONS.priority),
            topic_status: mergeUnique(normalizeList(ext.topic_status), DEFAULT_BCF_EXTENSIONS.topic_status),
          };
          setOptionsWarning(null);
        } else {
          setOptionsWarning("Options BCF par défaut utilisées : les extensions du projet n'ont pas pu être chargées.");
        }
        setExtensions(nextExtensions);
        setFormData(prev => ({
          ...prev,
          topic_type: prev.topic_type || nextExtensions.topic_type[0] || '',
          priority: prev.priority || nextExtensions.priority[0] || '',
          topic_status: prev.topic_status || nextExtensions.topic_status[0] || '',
        }));

        const usableMembersResp = membersResp?.ok ? membersResp : appMembersResp?.ok ? appMembersResp : null;
        if (usableMembersResp) {
          const data = await usableMembersResp.json();
          setMembers(
            (data || []).map((m: any) => ({
              id: m.id,
              email: m.email,
              name: `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email,
            }))
          );
        } else {
          const memberMap = new Map<string, { id: string; email: string; name: string }>();

          if (currentUserResp?.ok) {
            const user = await currentUserResp.json();
            const email = user.email || user.mail || user.userName;
            if (email) {
              memberMap.set(email, {
                id: user.id || email,
                email,
                name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || email,
              });
            }
          }

          if (topicsResp?.ok) {
            const topics = await topicsResp.json();
            (Array.isArray(topics) ? topics : []).forEach((topic: any) => {
              const email = String(topic.assigned_to || '').trim();
              if (email && !memberMap.has(email)) {
                memberMap.set(email, { id: email, email, name: email });
              }
            });
          }

          setMembers(Array.from(memberMap.values()));
        }
      } catch (e) {
        console.error('Failed to fetch BCF extensions:', e);
        setExtensions(DEFAULT_BCF_EXTENSIONS);
        setOptionsWarning("Options BCF par défaut utilisées : impossible de charger la configuration du projet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [isVisible, projectId, getAccessToken, proxyUrl]);

  const handleSubmit = useCallback(async () => {
    if (!formData.title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  }, [formData, onSubmit]);

  if (!isVisible) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    outline: 'none',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const fieldWrap: React.CSSProperties = { marginBottom: '12px' };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 1100,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#ffffff',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            backgroundColor: 'rgba(234,179,8,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth={2} style={{ width: '16px', height: '16px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#f1f5f9' }}>Nouveau BCF Topic</span>
        </div>
        <button
          onClick={onCancel}
          style={{
            width: '28px', height: '28px', borderRadius: '6px', border: 'none',
            backgroundColor: 'transparent', cursor: 'pointer', color: '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Form body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px' }}>
            Chargement des options...
          </div>
        ) : (
          <>
            {optionsWarning && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                fontSize: '12px',
                lineHeight: 1.4,
              }}>
                {optionsWarning}
              </div>
            )}

            <div style={fieldWrap}>
              <label style={labelStyle}>Titre *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Titre du topic BCF..."
                style={inputStyle}
                autoFocus
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description détaillée..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Type</label>
                <select
                  value={formData.topic_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, topic_type: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">-- Aucun --</option>
                  {extensions.topic_type.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Priorité</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">-- Aucune --</option>
                  {extensions.priority.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Statut</label>
                <select
                  value={formData.topic_status}
                  onChange={(e) => setFormData(prev => ({ ...prev, topic_status: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">-- Aucun --</option>
                  {extensions.topic_status.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Assigné à</label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">-- Personne --</option>
                  {members.map(m => <option key={m.id} value={m.email}>{m.name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        flexShrink: 0,
        backgroundColor: '#f8fafc',
      }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
            border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569',
            cursor: 'pointer',
          }}
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={!formData.title.trim() || submitting}
          style={{
            padding: '8px 20px', fontSize: '13px', fontWeight: 600, borderRadius: '8px',
            border: 'none',
            backgroundColor: !formData.title.trim() || submitting ? '#94a3b8' : '#0ea5e9',
            color: '#ffffff', cursor: !formData.title.trim() || submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '14px', height: '14px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {submitting ? 'Création...' : 'Créer le BCF'}
        </button>
      </div>
    </div>
  );
}
