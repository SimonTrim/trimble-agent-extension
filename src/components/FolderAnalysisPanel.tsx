import { useState, useEffect, useCallback, useRef } from 'react';
import { streamAgentRun, type AgentMessage } from '../services/agentService';
import type { SelectedExplorerItem } from '../workspaceApi';

interface FolderAnalysisPanelProps {
  isVisible: boolean;
  projectId: string;
  projectName: string;
  agentId: string;
  getAccessToken: () => Promise<string>;
  selectedItem: SelectedExplorerItem | null;
  onOpenModel3D?: (modelId: string) => void;
  onClose: () => void;
}

/**
 * Rend une ligne de markdown en React nodes.
 * Supporte : **bold**, [text](url), [text](tc-open-model://id) (lien cliquable vers le viewer 3D),
 * titres # ## ###, listes -/*.
 */
function renderLine(
  line: string,
  key: number | string,
  onOpenModel3D?: (modelId: string) => void
): React.ReactNode {
  const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const content = headerMatch[2];
    const style: React.CSSProperties = {
      margin: '8px 0 4px 0',
      fontWeight: 700,
      color: '#0f172a',
      fontSize: level === 1 ? '15px' : level === 2 ? '14px' : '13px',
    };
    return (
      <div key={key} style={style}>
        {renderInline(content, `${key}-h`, onOpenModel3D)}
      </div>
    );
  }

  const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (bulletMatch) {
    const indent = Math.min(Math.floor(bulletMatch[1].length / 2), 3);
    return (
      <div
        key={key}
        style={{ display: 'flex', gap: '6px', marginLeft: `${indent * 12}px`, lineHeight: 1.5 }}
      >
        <span style={{ color: '#7c3aed', flexShrink: 0, fontWeight: 700 }}>•</span>
        <span style={{ flex: 1 }}>{renderInline(bulletMatch[2], `${key}-b`, onOpenModel3D)}</span>
      </div>
    );
  }

  if (line.trim() === '---') {
    return <hr key={key} style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />;
  }

  if (line.trim() === '') {
    return <div key={key} style={{ height: '4px' }} />;
  }

  return (
    <div key={key} style={{ lineHeight: 1.5 }}>
      {renderInline(line, `${key}-l`, onOpenModel3D)}
    </div>
  );
}

function renderInline(
  text: string,
  keyPrefix: string | number,
  onOpenModel3D?: (modelId: string) => void
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let i = 0;

  while (remaining.length > 0) {
    const tc3dMatch = remaining.match(/^\[([^\]]+)\]\(tc-open-model:\/\/([^\s)]+)\)/);
    if (tc3dMatch && onOpenModel3D) {
      const [, label, modelId] = tc3dMatch;
      nodes.push(
        <button
          key={`${keyPrefix}-3d-${i++}`}
          onClick={() => onOpenModel3D(modelId)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            border: 'none',
            background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            margin: '1px 2px',
            verticalAlign: 'middle',
            boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          title="Ouvrir ce modèle dans le viewer 3D de Trimble Connect"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ width: '11px', height: '11px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
          {label}
        </button>
      );
      remaining = remaining.slice(tc3dMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i++}`} style={{ fontWeight: 700, color: '#0f172a' }}>
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push(<em key={`${keyPrefix}-i-${i++}`}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i++}`}
          style={{
            background: '#f1f5f9',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '11.5px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#475569',
          }}
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      nodes.push(
        <a
          key={`${keyPrefix}-l-${i++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', textDecoration: 'underline' }}
        >
          {label}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    let nextSpecial = remaining.length;
    for (const m of ['**', '*', '`', '[']) {
      const idx = remaining.indexOf(m, 1);
      if (idx >= 0 && idx < nextSpecial) nextSpecial = idx;
    }
    const chunk = remaining.slice(0, Math.max(1, nextSpecial));
    nodes.push(<span key={`${keyPrefix}-t-${i++}`}>{chunk}</span>);
    remaining = remaining.slice(chunk.length);
  }

  return nodes;
}

function renderMessage(text: string, onOpenModel3D?: (modelId: string) => void): React.ReactNode {
  return text.split('\n').map((line, i) => renderLine(line, i, onOpenModel3D));
}

type PanelStatus = 'form' | 'analyzing' | 'ready' | 'error';

interface AnalysisTarget {
  kind: 'root' | 'name' | 'item';
  name?: string;
  item?: SelectedExplorerItem;
}

export default function FolderAnalysisPanel({
  isVisible,
  projectId,
  projectName,
  agentId,
  getAccessToken,
  selectedItem,
  onOpenModel3D,
  onClose,
}: FolderAnalysisPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('form');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [folderNameInput, setFolderNameInput] = useState('');
  const [currentTarget, setCurrentTarget] = useState<AnalysisTarget | null>(null);

  const messagesRef = useRef<AgentMessage[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<{ description: string; value: string }[]>([]);
  const autoLaunchedForItemRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  const buildAnalysisContext = (target: AnalysisTarget): { description: string; value: string }[] => {
    const targetInfo =
      target.kind === 'item'
        ? `Cible: ${target.item!.type === 'FOLDER' ? 'DOSSIER' : 'FICHIER'} sélectionné "${target.item!.name}" (id: ${target.item!.id})`
        : target.kind === 'name'
          ? `Cible: dossier nommé "${target.name}" à trouver dans le projet`
          : `Cible: racine du projet`;

    const toolGuidance =
      target.kind === 'item' && target.item!.type === 'FOLDER'
        ? `Outils MCP à appeler (dans cet ordre) :
1. tc_get_folder_contents(projectId="${projectId}", folderId="${target.item!.id}") — liste du contenu
2. tc_api_call("GET", "/projects/${projectId}/folders/${target.item!.id}", {}) — métadonnées (taille, dates)
3. tc_api_call("GET", "/projects/${projectId}/folders/${target.item!.id}/permissions", {}) — permissions (si disponible, sinon skip)`
        : target.kind === 'item' && target.item!.type === 'FILE'
          ? `Outils MCP à appeler :
1. tc_get_file(projectId="${projectId}", fileId="${target.item!.id}") — détails fichier + versions`
          : target.kind === 'name'
            ? `Outils MCP à appeler (dans cet ordre) :
1. tc_get_project(projectId="${projectId}") — récupérer rootFolderId
2. tc_get_folder_contents(projectId="${projectId}", folderId=<rootFolderId>) — trouver le sous-dossier "${target.name}"
3. tc_get_folder_contents(projectId="${projectId}", folderId=<id-trouvé>) — lister son contenu
4. tc_api_call("GET", "/projects/${projectId}/folders/<id-trouvé>/permissions", {}) — permissions (optionnel)

Si aucun dossier ne correspond au nom "${target.name}", arrête-toi et liste les dossiers disponibles à la racine.`
            : `Outils MCP à appeler :
1. tc_get_project(projectId="${projectId}") — récupérer rootFolderId
2. tc_get_folder_contents(projectId="${projectId}", folderId=<rootFolderId>) — lister le contenu racine`;

    const formatInstructions = `Format de réponse OBLIGATOIRE (markdown, ~200 mots max) :

**Structure attendue :**

- Une ligne d'intro courte avec le nom du dossier et son rôle dans le projet.
- **Taille totale** : X Mo
- **Nombre d'éléments** : N fichiers + M sous-dossiers
- **Types principaux** : breakdown par extension (ex: IFC (5), PDF (3), DWG (2))
- **Dernière modification** : date — auteur
- **Accès & Permissions** :
  - Ton niveau d'accès : Full Access / Read Only
  - Liste des utilisateurs/groupes avec leur niveau (format : Nom (rôle) — niveau)
- **Modèles 3D clés** (max 3, seulement les plus pertinents type IFC/RVT/SKP) :
  - [Ouvrir dans le viewer 3D](tc-open-model://FILE_ID_RÉEL) — Nom du fichier
- **Actions suggérées** (2 à 3 actions concrètes liées au contenu)

**INTERDICTIONS ABSOLUES :**
- Ne PAS lister tous les fichiers un par un
- Ne PAS afficher de tableau avec tous les fichiers
- Ne PAS dépasser ~200 mots
- Ne PAS inventer de fichier : base-toi uniquement sur les résultats des outils MCP
- Pour les liens 3D, utilise EXACTEMENT la syntaxe \`[Ouvrir dans le viewer 3D](tc-open-model://{fileId})\` avec le vrai fileId retourné par l'API

**Pour les questions de suivi sur les versions :**
- Si on te demande "nouvelles versions ?" → utilise tc_api_call("GET", "/projects/${projectId}/files/<fileId>/versions", {}) ou tc_get_file pour lister les versions de chaque fichier récemment modifié
- Propose toujours d'ouvrir le modèle mis à jour dans le viewer 3D avec un lien tc-open-model://`;

    return [
      {
        description: 'folder_analysis_target',
        value: `Projet: "${projectName}" (projectId: ${projectId})
${targetInfo}`,
      },
      {
        description: 'folder_analysis_tools',
        value: toolGuidance,
      },
      {
        description: 'folder_analysis_response_format',
        value: formatInstructions,
      },
    ];
  };

  const buildUserQuestion = (target: AnalysisTarget): string => {
    if (target.kind === 'item') {
      const label = target.item!.type === 'FOLDER' ? 'dossier' : 'fichier';
      return `Qu'est-ce qu'il y a dans le ${label} "${target.item!.name}" ?`;
    }
    if (target.kind === 'name') {
      return `Qu'est-ce qu'il y a dans le dossier "${target.name}" ?`;
    }
    return `Qu'est-ce qu'il y a à la racine du projet "${projectName}" ?`;
  };

  const runAgentRequest = useCallback(
    async (allMessages: AgentMessage[]) => {
      streamAbortRef.current?.abort();
      const abort = new AbortController();
      streamAbortRef.current = abort;
      setStreamingText('');
      let acc = '';

      try {
        const token = await getAccessToken();
        if (abort.signal.aborted) return;

        const fullText = await streamAgentRun(agentId, allMessages, token, {
          threadId,
          context: contextRef.current,
          signal: abort.signal,
          onThreadId: (id) => setThreadId(id),
          onTextDelta: (delta) => {
            if (abort.signal.aborted) return;
            acc += delta;
            setStreamingText((prev) => prev + delta);
          },
          onError: (err) => {
            setErrorMsg(err);
            setStatus('error');
          },
        });

        if (abort.signal.aborted) return;

        const finalText = fullText || acc;
        if (finalText.trim()) {
          const assistantMessage: AgentMessage = { role: 'assistant', content: finalText };
          messagesRef.current = [...messagesRef.current, assistantMessage];
          setMessages([...messagesRef.current]);
        }
        setStreamingText('');
        setStatus('ready');
      } catch (err: any) {
        if (abort.signal.aborted) return;
        setErrorMsg(err?.message ?? 'Erreur inconnue');
        setStatus('error');
      }
    },
    [agentId, getAccessToken, threadId]
  );

  const startAnalysis = useCallback(
    (target: AnalysisTarget) => {
      setCurrentTarget(target);
      setStatus('analyzing');
      setMessages([]);
      messagesRef.current = [];
      setStreamingText('');
      setThreadId(undefined);
      setErrorMsg(null);

      contextRef.current = buildAnalysisContext(target);

      const question = buildUserQuestion(target);
      const userMessage: AgentMessage = { role: 'user', content: question };
      messagesRef.current = [userMessage];
      setMessages([userMessage]);
      runAgentRequest([userMessage]);
    },
    [projectId, projectName, runAgentRequest]
  );

  useEffect(() => {
    if (!isVisible) {
      streamAbortRef.current?.abort();
      setStatus('form');
      setMessages([]);
      messagesRef.current = [];
      setStreamingText('');
      setThreadId(undefined);
      setErrorMsg(null);
      setFolderNameInput('');
      setCurrentTarget(null);
      contextRef.current = [];
      autoLaunchedForItemRef.current = null;
      return;
    }

    if (selectedItem && autoLaunchedForItemRef.current !== selectedItem.id && status === 'form') {
      autoLaunchedForItemRef.current = selectedItem.id;
      startAnalysis({ kind: 'item', item: selectedItem });
    }
  }, [isVisible, selectedItem, status, startAnalysis]);

  const handleLaunchFromForm = useCallback(() => {
    const name = folderNameInput.trim();
    if (selectedItem && selectedItem.name === name) {
      startAnalysis({ kind: 'item', item: selectedItem });
    } else if (name) {
      startAnalysis({ kind: 'name', name });
    } else {
      startAnalysis({ kind: 'root' });
    }
  }, [folderNameInput, selectedItem, startAnalysis]);

  const handleSendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || status === 'analyzing') return;

    const userMessage: AgentMessage = { role: 'user', content: text };
    messagesRef.current = [...messagesRef.current, userMessage];
    setMessages([...messagesRef.current]);
    setInputValue('');
    setStatus('analyzing');
    setErrorMsg(null);

    await runAgentRequest([...messagesRef.current]);
  }, [inputValue, status, runAgentRequest]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClose = useCallback(() => {
    streamAbortRef.current?.abort();
    onClose();
  }, [onClose]);

  if (!isVisible) return null;

  const headerSubtitle =
    status === 'form'
      ? projectName
      : currentTarget?.kind === 'item'
        ? `${currentTarget.item!.type === 'FOLDER' ? 'Dossier' : 'Fichier'} : ${currentTarget.item!.name}`
        : currentTarget?.kind === 'name'
          ? `Dossier : ${currentTarget.name}`
          : `Racine du projet`;

  const statusLabel: Partial<Record<PanelStatus, string>> = {
    analyzing: 'Ava analyse…',
    ready: 'Analyse prête',
    error: 'Erreur',
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
          color: '#ffffff',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>Analyse du dossier</div>
            <div
              style={{
                fontSize: '11px',
                opacity: 0.85,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '240px',
              }}
              title={headerSubtitle}
            >
              {statusLabel[status] ? `${statusLabel[status]} · ` : ''}{headerSubtitle}
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          title="Fermer l'analyse"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '18px', height: '18px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {status === 'form' ? (
        // --- Formulaire de fallback : affiché uniquement si aucune sélection n'a été détectée ---
        <div
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: '#f8fafc',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
              border: '1px solid #fcd34d',
              color: '#78350f',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '13px' }}>
              Aucun dossier sélectionné
            </div>
            <div>
              Sélectionne d'abord un dossier dans l'explorer (clic sur son nom) puis reclique sur
              <strong> « Analyser le dossier »</strong>, ou tape son nom ci-dessous.
            </div>
          </div>

          <div>
            <label
              htmlFor="folder-name-input"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}
            >
              Nom du dossier (option 2)
            </label>
            <input
              id="folder-name-input"
              type="text"
              value={folderNameInput}
              onChange={(e) => setFolderNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLaunchFromForm(); }}
              placeholder="ex. Modèles CVCSE, Plans Divers, Rapports…"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
                background: '#ffffff',
                color: '#1e293b',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
              Projet courant : <strong>{projectName}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={handleLaunchFromForm}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              {folderNameInput.trim() ? `Analyser « ${folderNameInput.trim()} »` : 'Analyser la racine du projet'}
            </button>
          </div>
        </div>
      ) : (
        // --- Vue chat (analyse en cours / prête) ---
        <>
          {/* Target card */}
          <div
            style={{
              margin: '12px 12px 0 12px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
              border: '1px solid #ddd6fe',
              fontSize: '12px',
              color: '#4c1d95',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                {currentTarget?.kind === 'item'
                  ? currentTarget.item!.type === 'FOLDER' ? 'Dossier analysé' : 'Fichier analysé'
                  : currentTarget?.kind === 'name'
                    ? 'Dossier recherché'
                    : 'Racine du projet'}
              </div>
              <div style={{ wordBreak: 'break-word' }}>
                {currentTarget?.kind === 'item' ? currentTarget.item!.name : currentTarget?.kind === 'name' ? currentTarget.name : projectName}
              </div>
            </div>
            <button
              onClick={() => { streamAbortRef.current?.abort(); setStatus('form'); autoLaunchedForItemRef.current = null; }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #c4b5fd',
                background: '#ffffff',
                color: '#6d28d9',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title="Changer la cible"
            >
              Changer
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: '#f8fafc',
            }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 12px',
                    borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : '#ffffff',
                    color: msg.role === 'user' ? '#ffffff' : '#1e293b',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    boxShadow: msg.role === 'user' ? '0 2px 8px rgba(37,99,235,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
                    border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                    wordBreak: 'break-word',
                  }}
                >
                  {renderMessage(msg.content, msg.role === 'assistant' ? onOpenModel3D : undefined)}
                </div>
              </div>
            ))}

            {streamingText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 12px',
                    borderRadius: '14px 14px 14px 2px',
                    background: '#ffffff',
                    color: '#1e293b',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0',
                    wordBreak: 'break-word',
                  }}
                >
                  {renderMessage(streamingText, onOpenModel3D)}
                  <span style={{ display: 'inline-block', marginLeft: '2px', animation: 'pulse 1s infinite' }}>▊</span>
                </div>
              </div>
            )}

            {status === 'analyzing' && !streamingText && messages.length <= 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '14px 14px 14px 2px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#64748b',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', animation: 'spin 1s linear infinite' }} />
                  Ava analyse le dossier…
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '12px',
                }}
              >
                <strong>Erreur :</strong> {errorMsg}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid #e2e8f0',
              background: '#ffffff',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                padding: '6px',
                background: '#f1f5f9',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
              }}
            >
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={status === 'analyzing' ? 'Ava est en train de répondre…' : 'Poser une question (ex: "nouvelles versions ?", "ouvre le modèle CVC") …'}
                disabled={status === 'analyzing'}
                rows={1}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  resize: 'none',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  padding: '6px 8px',
                  maxHeight: '80px',
                  color: '#1e293b',
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={status === 'analyzing' || !inputValue.trim()}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: 'none',
                  background: inputValue.trim() && status !== 'analyzing' ? 'linear-gradient(135deg, #7c3aed, #4c1d95)' : '#cbd5e1',
                  color: '#ffffff',
                  cursor: inputValue.trim() && status !== 'analyzing' ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                }}
                title="Envoyer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
