import { useAuth } from "@trimble-oss/trimble-id-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "@trimble-oss/moduswebcomponents-react/modus-wc-styles.css";
import {
  ModusWcTooltip,
} from "@trimble-oss/moduswebcomponents-react";
import VoiceAssistant from "./components/VoiceAssistant";
import BcfCreationForm, { type BcfFormData } from "./components/BcfCreationForm";
import FolderAnalysisPanel from "./components/FolderAnalysisPanel";
import {
  ChatUiVariants,
  ContentVariants,
  ChatUiEventTypes,
  CHAT_UI_SUPPORTED_LOCALES,
  listenToChatUi,
  listenToChatUiEvents,
  updateConfig,
  type ChatUiConfiguration,
  type ChatUiEvent,
  type OnBeforeRunProvider,
} from "@trimble-agentic-external-npm-local/agentic-platform-sdk-iframe-typescript";
import {
  initWorkspaceApi, getSelectedObjects, isolateObjects, colorObjects, resetView,
  createBcfTopic, listBcfTopics, updateBcfTopic, resetWorkspaceApi,
  searchBcfTopics, getBcfTopic, deleteBcfTopic, listBcfComments, addBcfComment, getBcfExtensions,
  getCamera, setCameraPosition, getLoadedModels, toggleModelVisibility,
  addSectionPlane, removeSectionPlanes, getObjectPropertiesById,
  getLayers, setLayersVisibility, takeSnapshot,
  selectObjects, hideObjects, showAllObjects, zoomToObjects, setRenderMode, getModelTree,
  onExplorerSelectionChange, getSelectedExplorerItem,
  type SelectedExplorerItem,
} from "./workspaceApi";
import {
  AGENT_ENVIRONMENT,
  AGENT_IFRAME_ORIGIN,
  AGENT_IFRAME_URL,
  AGENT_ON_BEFORE_RUN_TIMEOUT_MS,
  AGENT_UI_LOCALE,
  DEFAULT_AGENT_ID,
  TC_PROXY_URL,
  TRIMBLE_CONNECT_ORIGIN,
  postTrimbleConnectToken,
} from "./agentRuntimeConfig";
import { parseToolArgs, requireExplicitConfirmation } from "./agentTools/toolUtils";

function App() {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth();
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
    // const [isViewerReady, setIsViewerReady] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string>("Cw3RYI17np8"); // Projet par défaut
  const [currentModule, setCurrentModule] = useState<string>('explorer'); // Module courant
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [projectsList, setProjectsList] = useState<{id: string, name: string}[]>([
    { id: "Cw3RYI17np8", name: "Présentation Générale Trimble Connect" }
  ]);
  const [showBcfForm, setShowBcfForm] = useState(false);
  const [bcfFormPrefill, setBcfFormPrefill] = useState<Partial<BcfFormData>>({});
  const bcfFormResolveRef = useRef<((value: string) => void) | null>(null);
  const [showFolderAnalysis, setShowFolderAnalysis] = useState(false);
  const [selectedExplorerItem, setSelectedExplorerItemState] = useState<SelectedExplorerItem | null>(
    () => getSelectedExplorerItem()
  );
  const [requestedModelId, setRequestedModelId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onExplorerSelectionChange((item) => {
      setSelectedExplorerItemState(item);
    });
    return unsubscribe;
  }, []);

  const openModel3DInViewer = useCallback((modelId: string) => {
    console.log("[App] Opening 3D model in viewer:", modelId);
    setRequestedModelId(modelId);
    setCurrentModule('viewer3d');
    setShowFolderAnalysis(false);
    setIsAgentOpen(false);
  }, []);

  const agenticPlatformAgent = DEFAULT_AGENT_ID;
  const agentIframeRef = useRef<HTMLIFrameElement>(null);
  const viewerIframeRef = useRef<HTMLIFrameElement>(null);
  
  const environment = AGENT_ENVIRONMENT;
  const agentIframeUrl = AGENT_IFRAME_URL;
  
  // URL dynamique pour le viewer ou les autres modules Trimble Connect
  const getIframeUrl = () => {
    switch (currentModule) {
      case 'projects':
        return `https://web.connect.trimble.com/?isEmbedded=true`;
      case 'viewer3d':
      case 'explorer':
        return `https://web.connect.trimble.com/?isEmbedded=true`;
      case 'views3d':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/data/views/3D?isEmbedded=true`;
      case 'views2d':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/data/views/2D?isEmbedded=true`;
      case 'releases':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/data/release?isEmbedded=true`;
      case 'activity':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/activity?isEmbedded=true`;
      case 'bcf':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/topics?isEmbedded=true`;
      case 'notes':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/todo?isEmbedded=true`;
      case 'team':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/team?isEmbedded=true`;
      case 'groups':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/property-set-libraries?isEmbedded=true`;
      case 'reality-capture':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/reality-capture?isEmbedded=true`;
      case 'dashboard':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/dashboard?isEmbedded=true`;
      case 'validation':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/validation?isEmbedded=true`;
      case 'settings':
      case 'settings-details':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/details?isEmbedded=true`;
      case 'settings-permissions':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/permissions?isEmbedded=true`;
      case 'settings-bcf':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/topics?isEmbedded=true`;
      case 'settings-extensions':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/extensions?isEmbedded=true`;
      case 'settings-notifications':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/notifications?isEmbedded=true`;
      case 'settings-labels':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/labels?isEmbedded=true`;
      case 'settings-units':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/units?isEmbedded=true`;
      case 'settings-sync':
        return `https://web.connect.trimble.com/projects/${currentProjectId}/settings/sync?isEmbedded=true`;
      default:
        return `https://web.connect.trimble.com/?isEmbedded=true`;
    }
  };
  const viewerIframeUrl = getIframeUrl();

  const onBeforeRun: OnBeforeRunProvider = useCallback(async (agentId: string) => {
    console.log("Agent ID starting:", agentId);

    const availableModules = [
      'projects', 'explorer', 'viewer3d', 'views3d', 'views2d', 'releases',
      'activity', 'bcf', 'reality-capture', 'dashboard', 'validation',
      'notes', 'team', 'groups',
    ];

    return {
      tools: {
        runTime: {
          navigate_to_module: {
            definition: {
              name: 'navigate_to_module',
              description: 'Navigate the Trimble Connect interface to a specific module/section. Use this when the user asks to go to the explorer, 3D viewer, BCF issues, notes, team management, etc.',
              parameters: {
                type: 'object',
                properties: {
                  module: {
                    type: 'string',
                    enum: availableModules,
                    description: 'Module to navigate to: projects (all projects), explorer/navigateur (file browser), viewer3d (3D viewer), views3d (saved 3D views), views2d (2D views), releases (transmittals/diffusions), activity (activity log), bcf (BCF issues), reality-capture, dashboard, validation, notes, team, groups (group libraries/property sets)',
                  },
                },
                required: ['module'],
              },
            },
            callback: async (args: any) => {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              const mod = parsed.module;
              if (!availableModules.includes(mod)) {
                return JSON.stringify({ success: false, error: `Module inconnu: ${mod}. Modules disponibles: ${availableModules.join(', ')}` });
              }
              setCurrentModule(mod);
              return JSON.stringify({ success: true, message: `Navigation vers le module "${mod}" effectuée.` });
            },
            timeOutInMs: 5000,
          },
          get_app_context: {
            definition: {
              name: 'get_app_context',
              description: 'Get the current application context: active module, current project, sidebar state, agent panel state. Use this to understand the current state of the Trimble Connect interface before taking actions.',
              parameters: { type: 'object', properties: {} },
            },
            callback: async () => {
              const project = projectsList.find(p => p.id === currentProjectId);
              return JSON.stringify({
                currentModule,
                currentProject: { id: currentProjectId, name: project?.name ?? 'Unknown' },
                sidebarExpanded,
                agentPanelOpen: true,
                availableModules: availableModules.map(m => {
                  const labels: Record<string, string> = {
                    projects: 'Tous les projets', explorer: 'Navigateur', viewer3d: 'Viewer 3D', views3d: 'Vues 3D',
                    views2d: 'Vues 2D', releases: 'Diffusions', activity: 'Activités',
                    bcf: 'Rubriques BCF', 'reality-capture': 'Reality Capture', dashboard: 'Dashboard',
                    validation: 'Validation', notes: 'Notes', team: 'Équipe', groups: 'Bibliothèques de groupes',
                  };
                  return { id: m, label: labels[m] ?? m };
                }),
              });
            },
            timeOutInMs: 5000,
          },
          toggle_sidebar: {
            definition: {
              name: 'toggle_sidebar',
              description: 'Expand or collapse the left navigation sidebar. Use when the user asks to show/hide module names or expand/collapse the sidebar.',
              parameters: {
                type: 'object',
                properties: {
                  expanded: {
                    type: 'boolean',
                    description: 'true to expand the sidebar (show labels), false to collapse it (icons only)',
                  },
                },
                required: ['expanded'],
              },
            },
            callback: async (args: any) => {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              setSidebarExpanded(!!parsed.expanded);
              return JSON.stringify({ success: true, sidebarExpanded: !!parsed.expanded });
            },
            timeOutInMs: 5000,
          },
          switch_project: {
            definition: {
              name: 'switch_project',
              description: 'Switch to a different Trimble Connect project. Use when the user asks to open or switch to another project.',
              parameters: {
                type: 'object',
                properties: {
                  projectId: {
                    type: 'string',
                    description: 'The project ID to switch to',
                  },
                },
                required: ['projectId'],
              },
            },
            callback: async (args: any) => {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              const project = projectsList.find(p => p.id === parsed.projectId);
              if (!project) {
                return JSON.stringify({ success: false, error: `Projet non trouvé. Projets disponibles: ${projectsList.map(p => `${p.name} (${p.id})`).join(', ')}` });
              }
              setCurrentProjectId(parsed.projectId);
              return JSON.stringify({ success: true, message: `Basculé vers le projet "${project.name}".` });
            },
            timeOutInMs: 5000,
          },
          list_available_projects: {
            definition: {
              name: 'list_available_projects',
              description: 'List all projects available in the application dropdown. Use to show the user which projects they can switch to.',
              parameters: { type: 'object', properties: {} },
            },
            callback: async () => {
              return JSON.stringify({
                projects: projectsList.map(p => ({ id: p.id, name: p.name, isCurrent: p.id === currentProjectId })),
              });
            },
            timeOutInMs: 5000,
          },
          toggle_voice_mode: {
            definition: {
              name: 'toggle_voice_mode',
              description: 'Switch between text chat and voice conversation mode. Use when the user asks to activate or deactivate voice mode.',
              parameters: {
                type: 'object',
                properties: {
                  enabled: {
                    type: 'boolean',
                    description: 'true to activate voice mode, false to return to text chat',
                  },
                },
                required: ['enabled'],
              },
            },
            callback: async (args: any) => {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              setIsVoiceMode(!!parsed.enabled);
              return JSON.stringify({ success: true, voiceMode: !!parsed.enabled });
            },
            timeOutInMs: 5000,
          },
          show_bcf_creation_form: {
            definition: {
              name: 'show_bcf_creation_form',
              description: 'Show an interactive BCF creation form to the user. Use when the user wants to create a BCF topic and prefers a visual form. You can pre-fill fields. The form will be displayed as an overlay and the user can edit and submit it.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Pre-filled title for the BCF topic' },
                  description: { type: 'string', description: 'Pre-filled description' },
                  topic_type: { type: 'string', description: 'Pre-filled type (must match project BCF extensions)' },
                  priority: { type: 'string', description: 'Pre-filled priority (must match project BCF extensions)' },
                  assigned_to: { type: 'string', description: 'Pre-filled assignee email' },
                },
              },
            },
            callback: async (args: any) => {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              return new Promise<string>((resolve) => {
                bcfFormResolveRef.current = resolve;
                setBcfFormPrefill(parsed || {});
                setShowBcfForm(true);
              });
            },
            timeOutInMs: 120000,
          },
          scan_current_folder: {
            definition: {
              name: 'scan_current_folder',
              description: 'Retrieves the current context (active project, selected folder/file in the Trimble Connect explorer). Returns the IDs needed so the agent can then call its MCP tool tc_get_folder_contents (or tc_get_file) to fetch the actual contents. Use this whenever the user asks to analyze or summarize the "current folder" or the folder they just selected.',
              parameters: { type: 'object', properties: {} },
            },
            callback: async () => {
              try {
                const selected = getSelectedExplorerItem();
                const projectName = projectsList.find(p => p.id === currentProjectId)?.name || 'Unknown';
                return JSON.stringify({
                  success: true,
                  projectId: currentProjectId,
                  projectName,
                  currentModule,
                  selectedItem: selected
                    ? { id: selected.id, name: selected.name, type: selected.type, versionId: selected.versionId }
                    : null,
                  nextStep: selected && selected.type === 'FOLDER'
                    ? `Call MCP tool tc_get_folder_contents with projectId="${currentProjectId}" and folderId="${selected.id}" to list this folder.`
                    : selected && selected.type === 'FILE'
                      ? `Call MCP tool tc_get_file with projectId="${currentProjectId}" and fileId="${selected.id}" to get file details.`
                      : `No item selected. Call MCP tool tc_get_project with projectId="${currentProjectId}" to get rootFolderId, then tc_get_folder_contents to list the root folder.`,
                });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
            timeOutInMs: 5000,
          },
        },
        global: {
          get_selected_objects: {
            callback: async (args: any) => {
              console.log("Tool called: get_selected_objects", args);
              const objects = await getSelectedObjects();
              
              // Helper function to safely stringify objects with BigInt
              const serializeWithBigInt = (obj: any) => {
                return JSON.stringify(obj, (_key, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                );
              };
              
              return serializeWithBigInt(objects);
            },
          },
          isolate_objects: {
            callback: async (args: any) => {
              console.log("Tool called: isolate_objects", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const { runtimeIds, modelId } = parsedArgs;
                const success = await isolateObjects(runtimeIds, modelId);
                return JSON.stringify({ success });
              } catch (e) {
                return JSON.stringify({ success: false, error: "Invalid arguments" });
              }
            },
          },
          color_objects: {
            callback: async (args: any) => {
              console.log("Tool called: color_objects", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const { runtimeIds, modelId, colorHex } = parsedArgs;
                const success = await colorObjects(runtimeIds, modelId, colorHex);
                return JSON.stringify({ success });
              } catch (e) {
                return JSON.stringify({ success: false, error: "Invalid arguments" });
              }
            },
          },
          reset_view: {
            callback: async (args: any) => {
              console.log("Tool called: reset_view", args);
              const success = await resetView();
              return JSON.stringify({ success });
            },
          },
          create_bcf_topic: {
            callback: async (args: any) => {
              console.log("Tool called: create_bcf_topic", args);
              try {
                const topicData = typeof args === 'string' ? JSON.parse(args) : args;
                const result = await createBcfTopic(topicData, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ error: e.message });
              }
            },
          },
          list_folder_items: {
            callback: async (args: any) => {
              console.log("Tool called: list_folder_items", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const folderId = parsedArgs.folderId || "root"; // 'root' par défaut si non spécifié
                const token = await getAccessTokenSilently();
                
                // Appel direct à l'API Trimble Connect
                const url = `${TC_PROXY_URL}/projects/${currentProjectId}/folders/${folderId}/items`;
                
                const response = await fetch(url, {
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                
                if (!response.ok) {
                  throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                return JSON.stringify({ success: true, data });
              } catch (e: any) {
                console.error("Error in list_folder_items:", e);
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_folder: {
            callback: async (args: any) => {
              console.log("Tool called: create_folder", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const folderName = parsedArgs.name;
                const parentId = parsedArgs.parentId || "root";
                
                if (!folderName) {
                  return JSON.stringify({ success: false, error: "Le nom du dossier est requis." });
                }

                const token = await getAccessTokenSilently();
                const url = `${TC_PROXY_URL}/projects/${currentProjectId}/folders`;
                
                const response = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    name: folderName,
                    parentId: parentId
                  })
                });
                
                if (!response.ok) {
                  throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                return JSON.stringify({ success: true, data });
              } catch (e: any) {
                console.error("Error in create_folder:", e);
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          list_bcf_topics: {
            callback: async (args: any) => {
              console.log("Tool called: list_bcf_topics", args);
              try {
                const result = await listBcfTopics(currentProjectId, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                console.error("Error in list_bcf_topics:", e);
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          update_bcf_status: {
            callback: async (args: any) => {
              console.log("Tool called: update_bcf_status", args);
              try {
                const parsedArgs = parseToolArgs(args);
                const { topicId, topic_status, title, description, priority, assigned_to, due_date, topic_type } = parsedArgs;

                if (!topicId) {
                  return JSON.stringify({ success: false, error: "Le topicId (GUID) du BCF est requis." });
                }

                const updateData: Record<string, any> = {};
                if (topic_status) updateData.topic_status = topic_status;
                if (title) updateData.title = title;
                if (description !== undefined) updateData.description = description;
                if (priority) updateData.priority = priority;
                if (assigned_to) updateData.assigned_to = assigned_to;
                if (due_date) updateData.due_date = due_date;
                if (topic_type) updateData.topic_type = topic_type;

                if (Object.keys(updateData).length === 0) {
                  return JSON.stringify({ success: false, error: "Aucun champ à mettre à jour fourni." });
                }

                const result = await updateBcfTopic(currentProjectId, String(topicId), updateData, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                console.error("Error in update_bcf_status:", e);
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          search_bcf_topics: {
            callback: async (args: any) => {
              console.log("Tool called: search_bcf_topics", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const result = await searchBcfTopics(currentProjectId, parsedArgs, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_bcf_topic: {
            callback: async (args: any) => {
              console.log("Tool called: get_bcf_topic", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.topicId) return JSON.stringify({ success: false, error: "topicId (GUID) requis" });
                const result = await getBcfTopic(currentProjectId, parsedArgs.topicId, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_bcf_topic: {
            callback: async (args: any) => {
              console.log("Tool called: delete_bcf_topic", args);
              try {
                const { parsedArgs, confirmationError } = requireExplicitConfirmation(args, "suppression d'un topic BCF");
                if (confirmationError) return confirmationError;
                if (!parsedArgs.topicId) return JSON.stringify({ success: false, error: "topicId (GUID) requis" });
                const result = await deleteBcfTopic(currentProjectId, String(parsedArgs.topicId), getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          list_bcf_comments: {
            callback: async (args: any) => {
              console.log("Tool called: list_bcf_comments", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.topicId) return JSON.stringify({ success: false, error: "topicId (GUID) requis" });
                const result = await listBcfComments(currentProjectId, parsedArgs.topicId, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          add_bcf_comment: {
            callback: async (args: any) => {
              console.log("Tool called: add_bcf_comment", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.topicId || !parsedArgs.comment) return JSON.stringify({ success: false, error: "topicId et comment requis" });
                const result = await addBcfComment(currentProjectId, parsedArgs.topicId, parsedArgs.comment, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_bcf_extensions: {
            callback: async (args: any) => {
              console.log("Tool called: get_bcf_extensions", args);
              try {
                const result = await getBcfExtensions(currentProjectId, getAccessTokenSilently);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          search_files: {
            callback: async (args: any) => {
              console.log("Tool called: search_files", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const query = parsedArgs.query || '*';
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/search?query=${encodeURIComponent(query)}&projectId=${currentProjectId}&type=FILE`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const lightData = (data || []).slice(0, 30).map((f: any) => ({
                  id: f.id, name: f.name, type: f.type, size: f.size,
                  parentId: f.parentId, modified: f.modifiedOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, count: lightData.length, files: lightData });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_file_details: {
            callback: async (args: any) => {
              console.log("Tool called: get_file_details", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.fileId) return JSON.stringify({ success: false, error: "fileId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/files/${parsedArgs.fileId}`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const f = await response.json();
                return JSON.stringify({ success: true, file: { id: f.id, name: f.name, type: f.type, size: f.size, parentId: f.parentId, version: f.versionId, modified: f.modifiedOn?.substring(0, 10), createdBy: f.createdBy } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_file_versions: {
            callback: async (args: any) => {
              console.log("Tool called: get_file_versions", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.fileId) return JSON.stringify({ success: false, error: "fileId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/files/${parsedArgs.fileId}/versions`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const lightVersions = (data || []).map((v: any) => ({
                  versionId: v.versionId, version: v.version, size: v.size,
                  createdBy: v.createdBy, createdOn: v.createdOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, versions: lightVersions });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          move_file: {
            callback: async (args: any) => {
              console.log("Tool called: move_file", args);
              try {
                const parsedArgs = parseToolArgs(args);
                if (!parsedArgs.fileId || !parsedArgs.parentId) return JSON.stringify({ success: false, error: "fileId et parentId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/files/${parsedArgs.fileId}`,
                  {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parentId: parsedArgs.parentId }),
                  }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, file: { id: data.id, name: data.name, parentId: data.parentId } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_file: {
            callback: async (args: any) => {
              console.log("Tool called: delete_file", args);
              try {
                const { parsedArgs, confirmationError } = requireExplicitConfirmation(args, "suppression d'un fichier Trimble Connect");
                if (confirmationError) return confirmationError;
                if (!parsedArgs.fileId) return JSON.stringify({ success: false, error: "fileId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/files/${parsedArgs.fileId}`,
                  { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Fichier ${parsedArgs.fileId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_camera: {
            callback: async (args: any) => {
              console.log("Tool called: get_camera", args);
              const result = await getCamera();
              return JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
            },
          },
          set_camera: {
            callback: async (args: any) => {
              console.log("Tool called: set_camera", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const result = await setCameraPosition(parsedArgs);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_models: {
            callback: async (args: any) => {
              console.log("Tool called: get_models", args);
              const result = await getLoadedModels();
              return JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
            },
          },
          toggle_model: {
            callback: async (args: any) => {
              console.log("Tool called: toggle_model", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.modelId) return JSON.stringify({ success: false, error: "modelId requis" });
                const result = await toggleModelVisibility(parsedArgs.modelId, parsedArgs.visible !== false);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          add_section_plane: {
            callback: async (args: any) => {
              console.log("Tool called: add_section_plane", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const result = await addSectionPlane(parsedArgs);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          remove_section_planes: {
            callback: async (args: any) => {
              console.log("Tool called: remove_section_planes", args);
              const result = await removeSectionPlanes();
              return JSON.stringify(result);
            },
          },
          remove_section_plane: {
            callback: async (args: any) => {
              console.log("Tool called: remove_section_plane", args);
              const result = await removeSectionPlanes();
              return JSON.stringify(result);
            },
          },
          get_object_properties: {
            callback: async (args: any) => {
              console.log("Tool called: get_object_properties", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.modelId || !parsedArgs.runtimeIds) return JSON.stringify({ success: false, error: "modelId et runtimeIds requis" });
                const result = await getObjectPropertiesById(parsedArgs.modelId, parsedArgs.runtimeIds);
                return JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_layers: {
            callback: async (args: any) => {
              console.log("Tool called: get_layers", args);
              const result = await getLayers();
              return JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
            },
          },
          set_layers_visibility: {
            callback: async (args: any) => {
              console.log("Tool called: set_layers_visibility", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const result = await setLayersVisibility(parsedArgs.layers || parsedArgs);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          set_layer_visibility: {
            callback: async (args: any) => {
              console.log("Tool called: set_layer_visibility", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const result = await setLayersVisibility(parsedArgs.layers || parsedArgs);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          take_snapshot: {
            callback: async (args: any) => {
              console.log("Tool called: take_snapshot", args);
              const result = await takeSnapshot();
              if (result.snapshot && result.snapshot.length > 500) {
                return JSON.stringify({ success: true, message: "Snapshot capturé avec succès.", length: result.snapshot.length });
              }
              return JSON.stringify(result);
            },
          },
          list_todos: {
            callback: async (args: any) => {
              console.log("Tool called: list_todos", args);
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/todos?projectId=${currentProjectId}`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const lightTodos = (data || []).slice(0, 30).map((t: any) => ({
                  id: t.id, title: t.label || t.title, status: t.status,
                  assignee: t.assigneeId, dueDate: t.dueDate?.substring(0, 10),
                  created: t.createdOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, count: lightTodos.length, todos: lightTodos });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_todo: {
            callback: async (args: any) => {
              console.log("Tool called: create_todo", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.title && !parsedArgs.label) return JSON.stringify({ success: false, error: "title requis" });
                const token = await getAccessTokenSilently();
                const body: any = { label: parsedArgs.title || parsedArgs.label, projectId: currentProjectId };
                if (parsedArgs.description) body.description = parsedArgs.description;
                if (parsedArgs.assigneeId) body.assigneeId = parsedArgs.assigneeId;
                if (parsedArgs.dueDate) body.dueDate = parsedArgs.dueDate;
                if (parsedArgs.priority) body.priority = parsedArgs.priority;
                const response = await fetch(
                  `${TC_PROXY_URL}/todos`,
                  {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, todo: { id: data.id, title: data.label, status: data.status } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          update_todo: {
            callback: async (args: any) => {
              console.log("Tool called: update_todo", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.todoId) return JSON.stringify({ success: false, error: "todoId requis" });
                const token = await getAccessTokenSilently();
                const { todoId, ...updateData } = parsedArgs;
                if (updateData.title) { updateData.label = updateData.title; delete updateData.title; }
                const response = await fetch(
                  `${TC_PROXY_URL}/todos/${todoId}`,
                  {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData),
                  }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, todo: { id: data.id, title: data.label, status: data.status } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_todo: {
            callback: async (args: any) => {
              console.log("Tool called: delete_todo", args);
              try {
                const { parsedArgs, confirmationError } = requireExplicitConfirmation(args, "suppression d'une note/todo Trimble Connect");
                if (confirmationError) return confirmationError;
                if (!parsedArgs.todoId) return JSON.stringify({ success: false, error: "todoId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/todos/${parsedArgs.todoId}`,
                  { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Todo ${parsedArgs.todoId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          list_views: {
            callback: async (args: any) => {
              console.log("Tool called: list_views", args);
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/views?projectId=${currentProjectId}`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const lightViews = (data || []).slice(0, 30).map((v: any) => ({
                  id: v.id, name: v.name, type: v.type,
                  created: v.createdOn?.substring(0, 10), createdBy: v.createdBy,
                }));
                return JSON.stringify({ success: true, count: lightViews.length, views: lightViews });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_view: {
            callback: async (args: any) => {
              console.log("Tool called: create_view", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.name) return JSON.stringify({ success: false, error: "name requis" });
                const token = await getAccessTokenSilently();
                const cameraResult = await getCamera();
                const body: any = { name: parsedArgs.name, projectId: currentProjectId, camera: cameraResult.camera || {} };
                if (parsedArgs.description) body.description = parsedArgs.description;
                const response = await fetch(
                  `${TC_PROXY_URL}/views`,
                  {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, view: { id: data.id, name: data.name } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_view: {
            callback: async (args: any) => {
              console.log("Tool called: delete_view", args);
              try {
                const { parsedArgs, confirmationError } = requireExplicitConfirmation(args, "suppression d'une vue Trimble Connect");
                if (confirmationError) return confirmationError;
                if (!parsedArgs.viewId) return JSON.stringify({ success: false, error: "viewId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/views/${parsedArgs.viewId}`,
                  { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Vue ${parsedArgs.viewId} supprimée.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          list_clash_sets: {
            callback: async (args: any) => {
              console.log("Tool called: list_clash_sets", args);
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/clashsets?projectId=${currentProjectId}`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const lightClash = (data || []).map((c: any) => ({
                  id: c.id, name: c.name, status: c.status,
                  resultCount: c.resultCount, created: c.createdOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, count: lightClash.length, clashSets: lightClash });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_clash_results: {
            callback: async (args: any) => {
              console.log("Tool called: get_clash_results", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.clashSetId) return JSON.stringify({ success: false, error: "clashSetId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `${TC_PROXY_URL}/clashsets/${parsedArgs.clashSetId}/results`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const lightResults = (data || []).slice(0, 50).map((r: any) => ({
                  id: r.id, status: r.status,
                  element1: { modelId: r.element1?.modelId, objectId: r.element1?.objectRuntimeId },
                  element2: { modelId: r.element2?.modelId, objectId: r.element2?.objectRuntimeId },
                  distance: r.distance,
                }));
                return JSON.stringify({ success: true, count: lightResults.length, results: lightResults });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Projet & Utilisateur
          // ============================================================
          get_project_details: {
            callback: async () => {
              console.log("Tool called: get_project_details");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const p = await response.json();
                return JSON.stringify({ success: true, project: { id: p.id, name: p.name, description: p.description, location: p.location, status: p.status, createdOn: p.createdOn?.substring(0, 10), modifiedOn: p.modifiedOn?.substring(0, 10), thumbnailUrl: p.thumbnailUrl, rootFolderId: p.rootFolderId } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          update_project: {
            callback: async (args: any) => {
              console.log("Tool called: update_project", args);
              try {
                const { parsedArgs, confirmationError } = requireExplicitConfirmation(args, "modification des informations du projet");
                if (confirmationError) return confirmationError;
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(parsedArgs),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, project: { id: data.id, name: data.name, description: data.description } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_current_user: {
            callback: async () => {
              console.log("Tool called: get_current_user");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/users/me`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const u = await response.json();
                return JSON.stringify({ success: true, user: { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, displayName: u.displayName || `${u.firstName} ${u.lastName}`, company: u.company, status: u.status } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Équipe / Membres du projet
          // ============================================================
          list_team_members: {
            callback: async () => {
              console.log("Tool called: list_team_members");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/users`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const members = (data || []).map((m: any) => ({
                  id: m.id, email: m.email, firstName: m.firstName, lastName: m.lastName,
                  role: m.role, status: m.status, joinedOn: m.joinedOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, count: members.length, members });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          add_team_member: {
            callback: async (args: any) => {
              console.log("Tool called: add_team_member", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.email) return JSON.stringify({ success: false, error: "email requis" });
                const token = await getAccessTokenSilently();
                const body: any = { email: parsedArgs.email };
                if (parsedArgs.role) body.role = parsedArgs.role;
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/users`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, member: { id: data.id, email: data.email, role: data.role } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          remove_team_member: {
            callback: async (args: any) => {
              console.log("Tool called: remove_team_member", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.userId) return JSON.stringify({ success: false, error: "userId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/users/${parsedArgs.userId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Membre ${parsedArgs.userId} retiré du projet.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          update_member_role: {
            callback: async (args: any) => {
              console.log("Tool called: update_member_role", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.userId || !parsedArgs.role) return JSON.stringify({ success: false, error: "userId et role requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/users/${parsedArgs.userId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: parsedArgs.role }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, member: { id: data.id, email: data.email, role: data.role } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Groupes d'utilisateurs
          // ============================================================
          list_user_groups: {
            callback: async () => {
              console.log("Tool called: list_user_groups");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/groups`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const groups = (data || []).map((g: any) => ({
                  id: g.id, name: g.name, memberCount: g.members?.length || g.memberCount,
                }));
                return JSON.stringify({ success: true, count: groups.length, groups });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_user_group: {
            callback: async (args: any) => {
              console.log("Tool called: create_user_group", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.name) return JSON.stringify({ success: false, error: "name requis" });
                const token = await getAccessTokenSilently();
                const body: any = { name: parsedArgs.name, projectId: currentProjectId };
                if (parsedArgs.memberIds) body.members = parsedArgs.memberIds;
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/groups`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, group: { id: data.id, name: data.name } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          update_user_group: {
            callback: async (args: any) => {
              console.log("Tool called: update_user_group", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.groupId) return JSON.stringify({ success: false, error: "groupId requis" });
                const { groupId, ...updateData } = parsedArgs;
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/groups/${groupId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(updateData),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, group: { id: data.id, name: data.name } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_user_group: {
            callback: async (args: any) => {
              console.log("Tool called: delete_user_group", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.groupId) return JSON.stringify({ success: false, error: "groupId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/groups/${parsedArgs.groupId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Groupe ${parsedArgs.groupId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Dossiers (compléments)
          // ============================================================
          get_folder_details: {
            callback: async (args: any) => {
              console.log("Tool called: get_folder_details", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.folderId) return JSON.stringify({ success: false, error: "folderId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/folders/${parsedArgs.folderId}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const f = await response.json();
                return JSON.stringify({ success: true, folder: { id: f.id, name: f.name, parentId: f.parentId, size: f.size, itemCount: f.itemCount, createdOn: f.createdOn?.substring(0, 10), modifiedOn: f.modifiedOn?.substring(0, 10), createdBy: f.createdBy } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          rename_folder: {
            callback: async (args: any) => {
              console.log("Tool called: rename_folder", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.folderId || !parsedArgs.name) return JSON.stringify({ success: false, error: "folderId et name requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/folders/${parsedArgs.folderId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: parsedArgs.name }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, folder: { id: data.id, name: data.name } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_folder: {
            callback: async (args: any) => {
              console.log("Tool called: delete_folder", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.folderId) return JSON.stringify({ success: false, error: "folderId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/folders/${parsedArgs.folderId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Dossier ${parsedArgs.folderId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          move_folder: {
            callback: async (args: any) => {
              console.log("Tool called: move_folder", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.folderId || !parsedArgs.parentId) return JSON.stringify({ success: false, error: "folderId et parentId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/folders/${parsedArgs.folderId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ parentId: parsedArgs.parentId }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, folder: { id: data.id, name: data.name, parentId: data.parentId } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Fichiers (compléments)
          // ============================================================
          rename_file: {
            callback: async (args: any) => {
              console.log("Tool called: rename_file", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.fileId || !parsedArgs.name) return JSON.stringify({ success: false, error: "fileId et name requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/files/${parsedArgs.fileId}`, {
                  method: 'PATCH',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: parsedArgs.name }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, file: { id: data.id, name: data.name } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_file_download_url: {
            callback: async (args: any) => {
              console.log("Tool called: get_file_download_url", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.fileId) return JSON.stringify({ success: false, error: "fileId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/files/${parsedArgs.fileId}/downloadurl`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, url: data.url || data });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Partages (Shares)
          // ============================================================
          list_shares: {
            callback: async (args: any) => {
              console.log("Tool called: list_shares", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const token = await getAccessTokenSilently();
                let url = `${TC_PROXY_URL}/shares?projectId=${currentProjectId}`;
                if (parsedArgs?.fileId) url += `&fileId=${parsedArgs.fileId}`;
                const response = await fetch(url, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const shares = (data || []).map((s: any) => ({
                  id: s.id, fileId: s.fileId, fileName: s.fileName,
                  sharedWith: s.sharedWith, sharedBy: s.sharedBy,
                  createdOn: s.createdOn?.substring(0, 10), expiresOn: s.expiresOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, count: shares.length, shares });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_share: {
            callback: async (args: any) => {
              console.log("Tool called: create_share", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.fileId || !parsedArgs.email) return JSON.stringify({ success: false, error: "fileId et email requis" });
                const token = await getAccessTokenSilently();
                const body: any = { fileId: parsedArgs.fileId, sharedWith: parsedArgs.email, projectId: currentProjectId };
                if (parsedArgs.message) body.message = parsedArgs.message;
                if (parsedArgs.expiresOn) body.expiresOn = parsedArgs.expiresOn;
                const response = await fetch(`${TC_PROXY_URL}/shares`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, share: { id: data.id, fileId: data.fileId, sharedWith: data.sharedWith } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_share: {
            callback: async (args: any) => {
              console.log("Tool called: delete_share", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.shareId) return JSON.stringify({ success: false, error: "shareId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/shares/${parsedArgs.shareId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Partage ${parsedArgs.shareId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Releases (Diffusions)
          // ============================================================
          list_releases: {
            callback: async () => {
              console.log("Tool called: list_releases");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/releases?projectId=${currentProjectId}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const releases = (data || []).map((r: any) => ({
                  id: r.id, name: r.name, status: r.status, description: r.description,
                  createdOn: r.createdOn?.substring(0, 10), createdBy: r.createdBy,
                  sentOn: r.sentOn?.substring(0, 10), fileCount: r.files?.length || r.fileCount,
                }));
                return JSON.stringify({ success: true, count: releases.length, releases });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_release_details: {
            callback: async (args: any) => {
              console.log("Tool called: get_release_details", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.releaseId) return JSON.stringify({ success: false, error: "releaseId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/releases/${parsedArgs.releaseId}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const r = await response.json();
                return JSON.stringify({ success: true, release: { id: r.id, name: r.name, status: r.status, description: r.description, createdOn: r.createdOn?.substring(0, 10), sentOn: r.sentOn?.substring(0, 10), files: r.files, recipients: r.recipients } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_release: {
            callback: async (args: any) => {
              console.log("Tool called: create_release", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.name) return JSON.stringify({ success: false, error: "name requis" });
                const token = await getAccessTokenSilently();
                const body: any = { name: parsedArgs.name, projectId: currentProjectId };
                if (parsedArgs.description) body.description = parsedArgs.description;
                if (parsedArgs.fileIds) body.files = parsedArgs.fileIds.map((id: string) => ({ id }));
                if (parsedArgs.recipientEmails) body.recipients = parsedArgs.recipientEmails;
                const response = await fetch(`${TC_PROXY_URL}/releases`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, release: { id: data.id, name: data.name, status: data.status } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          send_release: {
            callback: async (args: any) => {
              console.log("Tool called: send_release", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.releaseId) return JSON.stringify({ success: false, error: "releaseId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/releases/${parsedArgs.releaseId}/send`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message: parsedArgs.message || '' }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Release ${parsedArgs.releaseId} envoyée.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Tags / Labels
          // ============================================================
          list_tags: {
            callback: async () => {
              console.log("Tool called: list_tags");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/projects/${currentProjectId}/tags`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const tags = (data || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color }));
                return JSON.stringify({ success: true, count: tags.length, tags });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          add_tag: {
            callback: async (args: any) => {
              console.log("Tool called: add_tag", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.objectId || !parsedArgs.objectType || !parsedArgs.tagName) return JSON.stringify({ success: false, error: "objectId, objectType et tagName requis" });
                const token = await getAccessTokenSilently();
                const typePath = parsedArgs.objectType.toLowerCase() + 's';
                const response = await fetch(`${TC_PROXY_URL}/${typePath}/${parsedArgs.objectId}/tags`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: parsedArgs.tagName }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, tag: data });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          remove_tag: {
            callback: async (args: any) => {
              console.log("Tool called: remove_tag", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.objectId || !parsedArgs.objectType || !parsedArgs.tagId) return JSON.stringify({ success: false, error: "objectId, objectType et tagId requis" });
                const token = await getAccessTokenSilently();
                const typePath = parsedArgs.objectType.toLowerCase() + 's';
                const response = await fetch(`${TC_PROXY_URL}/${typePath}/${parsedArgs.objectId}/tags/${parsedArgs.tagId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Tag retiré.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Activités
          // ============================================================
          list_activities: {
            callback: async (args: any) => {
              console.log("Tool called: list_activities", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {});
                const token = await getAccessTokenSilently();
                let url = `${TC_PROXY_URL}/projects/${currentProjectId}/activities`;
                const params: string[] = [];
                if (parsedArgs.type) params.push(`type=${encodeURIComponent(parsedArgs.type)}`);
                if (parsedArgs.limit) params.push(`$top=${parsedArgs.limit}`);
                if (parsedArgs.userId) params.push(`userId=${encodeURIComponent(parsedArgs.userId)}`);
                if (params.length) url += '?' + params.join('&');
                const response = await fetch(url, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const activities = (data || []).slice(0, 50).map((a: any) => ({
                  id: a.id, type: a.type, action: a.action, objectType: a.objectType,
                  objectName: a.objectName, user: a.user?.email || a.userId,
                  date: a.createdOn?.substring(0, 19),
                }));
                return JSON.stringify({ success: true, count: activities.length, activities });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Commentaires TC Core (fichiers, dossiers, todos, views)
          // ============================================================
          list_comments: {
            callback: async (args: any) => {
              console.log("Tool called: list_comments", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.objectId || !parsedArgs.objectType) return JSON.stringify({ success: false, error: "objectId et objectType requis (file, folder, todo, view)" });
                const token = await getAccessTokenSilently();
                const typePath = parsedArgs.objectType.toLowerCase() + 's';
                const response = await fetch(`${TC_PROXY_URL}/${typePath}/${parsedArgs.objectId}/comments`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const comments = (data || []).map((c: any) => ({
                  id: c.id, text: c.text || c.content, author: c.createdBy,
                  createdOn: c.createdOn?.substring(0, 19), modifiedOn: c.modifiedOn?.substring(0, 19),
                }));
                return JSON.stringify({ success: true, count: comments.length, comments });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          add_comment: {
            callback: async (args: any) => {
              console.log("Tool called: add_comment", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.objectId || !parsedArgs.objectType || !parsedArgs.text) return JSON.stringify({ success: false, error: "objectId, objectType et text requis" });
                const token = await getAccessTokenSilently();
                const typePath = parsedArgs.objectType.toLowerCase() + 's';
                const response = await fetch(`${TC_PROXY_URL}/${typePath}/${parsedArgs.objectId}/comments`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: parsedArgs.text }),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, comment: { id: data.id, text: data.text || data.content, author: data.createdBy } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Object Links (liens entre objets 3D et fichiers/tâches)
          // ============================================================
          list_object_links: {
            callback: async (args: any) => {
              console.log("Tool called: list_object_links", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.objectId) return JSON.stringify({ success: false, error: "objectId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/objectlinks?projectId=${currentProjectId}&objectId=${parsedArgs.objectId}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const links = (data || []).map((l: any) => ({
                  id: l.id, sourceType: l.sourceType, sourceId: l.sourceId,
                  targetType: l.targetType, targetId: l.targetId, targetName: l.targetName,
                }));
                return JSON.stringify({ success: true, count: links.length, links });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          create_object_link: {
            callback: async (args: any) => {
              console.log("Tool called: create_object_link", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.sourceId || !parsedArgs.targetId) return JSON.stringify({ success: false, error: "sourceId et targetId requis" });
                const token = await getAccessTokenSilently();
                const body: any = {
                  projectId: currentProjectId,
                  sourceId: parsedArgs.sourceId, sourceType: parsedArgs.sourceType || 'OBJECT',
                  targetId: parsedArgs.targetId, targetType: parsedArgs.targetType || 'FILE',
                };
                const response = await fetch(`${TC_PROXY_URL}/objectlinks`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, link: { id: data.id, sourceId: data.sourceId, targetId: data.targetId } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_object_link: {
            callback: async (args: any) => {
              console.log("Tool called: delete_object_link", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.linkId) return JSON.stringify({ success: false, error: "linkId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/objectlinks/${parsedArgs.linkId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Lien ${parsedArgs.linkId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Clash Detection (compléments)
          // ============================================================
          create_clash_set: {
            callback: async (args: any) => {
              console.log("Tool called: create_clash_set", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.name || !parsedArgs.modelIds) return JSON.stringify({ success: false, error: "name et modelIds requis" });
                const token = await getAccessTokenSilently();
                const body: any = { name: parsedArgs.name, projectId: currentProjectId, modelIds: parsedArgs.modelIds };
                if (parsedArgs.tolerance !== undefined) body.tolerance = parsedArgs.tolerance;
                if (parsedArgs.type) body.type = parsedArgs.type;
                const response = await fetch(`${TC_PROXY_URL}/clashsets`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, clashSet: { id: data.id, name: data.name, status: data.status } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_clash_set: {
            callback: async (args: any) => {
              console.log("Tool called: delete_clash_set", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.clashSetId) return JSON.stringify({ success: false, error: "clashSetId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/clashsets/${parsedArgs.clashSetId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Clash set ${parsedArgs.clashSetId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Vues (compléments)
          // ============================================================
          update_view: {
            callback: async (args: any) => {
              console.log("Tool called: update_view", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.viewId) return JSON.stringify({ success: false, error: "viewId requis" });
                const { viewId, ...updateData } = parsedArgs;
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/views/${viewId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(updateData),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, view: { id: data.id, name: data.name } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          list_view_groups: {
            callback: async () => {
              console.log("Tool called: list_view_groups");
              try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/viewgroups?projectId=${currentProjectId}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const groups = (data || []).map((g: any) => ({ id: g.id, name: g.name, viewCount: g.viewCount || g.views?.length }));
                return JSON.stringify({ success: true, count: groups.length, groups });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Viewer 3D (compléments avancés)
          // ============================================================
          select_objects: {
            callback: async (args: any) => {
              console.log("Tool called: select_objects", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.modelId || !parsedArgs.runtimeIds) return JSON.stringify({ success: false, error: "modelId et runtimeIds requis" });
                const result = await selectObjects(parsedArgs.modelId, parsedArgs.runtimeIds);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          hide_objects: {
            callback: async (args: any) => {
              console.log("Tool called: hide_objects", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.modelId || !parsedArgs.runtimeIds) return JSON.stringify({ success: false, error: "modelId et runtimeIds requis" });
                const result = await hideObjects(parsedArgs.runtimeIds, parsedArgs.modelId);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          show_all_objects: {
            callback: async () => {
              console.log("Tool called: show_all_objects");
              const result = await showAllObjects();
              return JSON.stringify(result);
            },
          },
          zoom_to_objects: {
            callback: async (args: any) => {
              console.log("Tool called: zoom_to_objects", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.modelId || !parsedArgs.runtimeIds) return JSON.stringify({ success: false, error: "modelId et runtimeIds requis" });
                const result = await zoomToObjects(parsedArgs.modelId, parsedArgs.runtimeIds);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          set_render_mode: {
            callback: async (args: any) => {
              console.log("Tool called: set_render_mode", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.mode) return JSON.stringify({ success: false, error: "mode requis (shaded, wireframe, xray, etc.)" });
                const result = await setRenderMode(parsedArgs.mode);
                return JSON.stringify(result);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          get_model_tree: {
            callback: async (args: any) => {
              console.log("Tool called: get_model_tree", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.modelId) return JSON.stringify({ success: false, error: "modelId requis" });
                const result = await getModelTree(parsedArgs.modelId);
                return JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Recherche globale
          // ============================================================
          search_all: {
            callback: async (args: any) => {
              console.log("Tool called: search_all", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.query) return JSON.stringify({ success: false, error: "query requis" });
                const token = await getAccessTokenSilently();
                let url = `${TC_PROXY_URL}/search?query=${encodeURIComponent(parsedArgs.query)}&projectId=${currentProjectId}`;
                if (parsedArgs.type) url += `&type=${encodeURIComponent(parsedArgs.type)}`;
                const response = await fetch(url, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const results = (data || []).slice(0, 30).map((r: any) => ({
                  id: r.id, name: r.name, type: r.type, parentId: r.parentId,
                  modified: r.modifiedOn?.substring(0, 10),
                }));
                return JSON.stringify({ success: true, count: results.length, results });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // BCF Viewpoints (compléments)
          // ============================================================
          list_bcf_viewpoints: {
            callback: async (args: any) => {
              console.log("Tool called: list_bcf_viewpoints", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.topicId) return JSON.stringify({ success: false, error: "topicId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `https://trimble-agent-extension.vercel.app/api/projects/${currentProjectId}/bcf/topics/${parsedArgs.topicId}/viewpoints`,
                  { headers: { 'Authorization': `Bearer ${token}`, 'X-Project-Region': 'eu' } }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const viewpoints = (data || []).map((v: any) => ({
                  guid: v.guid, index: v.index,
                  hasPerspective: !!v.perspective_camera, hasOrthogonal: !!v.orthogonal_camera,
                  hasSnapshot: !!v.snapshot,
                }));
                return JSON.stringify({ success: true, count: viewpoints.length, viewpoints });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          update_bcf_comment: {
            callback: async (args: any) => {
              console.log("Tool called: update_bcf_comment", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.topicId || !parsedArgs.commentId || !parsedArgs.comment) return JSON.stringify({ success: false, error: "topicId, commentId et comment requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `https://trimble-agent-extension.vercel.app/api/projects/${currentProjectId}/bcf/topics/${parsedArgs.topicId}/comments/${parsedArgs.commentId}`,
                  {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Project-Region': 'eu' },
                    body: JSON.stringify({ comment: parsedArgs.comment }),
                  }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, comment: { guid: data.guid, comment: data.comment, author: data.author } });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          delete_bcf_comment: {
            callback: async (args: any) => {
              console.log("Tool called: delete_bcf_comment", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.topicId || !parsedArgs.commentId) return JSON.stringify({ success: false, error: "topicId et commentId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(
                  `https://trimble-agent-extension.vercel.app/api/projects/${currentProjectId}/bcf/topics/${parsedArgs.topicId}/comments/${parsedArgs.commentId}`,
                  {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}`, 'X-Project-Region': 'eu' },
                  }
                );
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                return JSON.stringify({ success: true, message: `Commentaire ${parsedArgs.commentId} supprimé.` });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Synchronisation d'objets (Object Sync)
          // ============================================================
          get_object_sync: {
            callback: async (args: any) => {
              console.log("Tool called: get_object_sync", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const token = await getAccessTokenSilently();
                let url = `${TC_PROXY_URL}/projects/${currentProjectId}/sync`;
                if (parsedArgs?.since) url += `?since=${encodeURIComponent(parsedArgs.since)}`;
                const response = await fetch(url, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, changes: data });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },

          // ============================================================
          // Permissions dossiers
          // ============================================================
          get_folder_permissions: {
            callback: async (args: any) => {
              console.log("Tool called: get_folder_permissions", args);
              try {
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                if (!parsedArgs.folderId) return JSON.stringify({ success: false, error: "folderId requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/folders/${parsedArgs.folderId}/permissions`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, permissions: data });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
          set_folder_permissions: {
            callback: async (args: any) => {
              console.log("Tool called: set_folder_permissions", args);
              try {
                const { parsedArgs, confirmationError } = requireExplicitConfirmation(args, "modification des permissions d'un dossier");
                if (confirmationError) return confirmationError;
                if (!parsedArgs.folderId || !parsedArgs.permissions) return JSON.stringify({ success: false, error: "folderId et permissions requis" });
                const token = await getAccessTokenSilently();
                const response = await fetch(`${TC_PROXY_URL}/folders/${parsedArgs.folderId}/permissions`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(parsedArgs.permissions),
                });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return JSON.stringify({ success: true, permissions: data });
              } catch (e: any) {
                return JSON.stringify({ success: false, error: e.message });
              }
            },
          },
        },
      },
      runContext: {
        context: [
          {
            description: "User and response preferences",
            value: JSON.stringify({
              authenticated: isAuthenticated,
              language: "fr-FR",
              instruction: "Répondre en français clair, sans jargon inutile.",
            }),
          },
          {
            description: "Current Trimble Connect project and UI state",
            value: JSON.stringify({
              projectId: currentProjectId,
              projectName: projectsList.find(p => p.id === currentProjectId)?.name ?? 'Unknown',
              module: currentModule,
              sidebar: sidebarExpanded ? 'expanded' : 'collapsed',
            }),
          },
          {
            description: "Selected item in Trimble Connect explorer",
            value: selectedExplorerItem
              ? JSON.stringify({
                  id: selectedExplorerItem.id,
                  name: selectedExplorerItem.name,
                  type: selectedExplorerItem.type,
                  versionId: selectedExplorerItem.versionId,
                })
              : "No explorer item selected",
          },
          {
            description: "Available host modules and capabilities",
            value: "Modules: projects, explorer, viewer3d, views3d, views2d, releases, activity, bcf, reality-capture, dashboard, validation, notes, team, groups. Capabilities: navigation, selected 3D objects, BCF, files/folders, todos, views, clash data, teams, groups, layers, camera, snapshots, viewer state.",
          },
          {
            description: "Safety rule for sensitive actions",
            value: "Before deleting files, BCF topics, todos, views, changing permissions, or updating project metadata, ask the user to confirm. Then call the tool with confirmed=true.",
          },
        ],
      },
    };
  }, [getAccessTokenSilently, currentProjectId, currentModule, sidebarExpanded, projectsList, selectedExplorerItem, isAuthenticated]);

  const provideConfig = useCallback(
    (): ChatUiConfiguration => ({
      agentId: agenticPlatformAgent,
      environment,
      onBeforeRunTimeout: AGENT_ON_BEFORE_RUN_TIMEOUT_MS,
      uiConfig: {
        theme: "light",
        contentVariant: ContentVariants.Chat,
        variant: ChatUiVariants.Narrow,
        chatInput: {
          buttons: [
            { id: 'create-bcf', label: 'Créer un BCF' },
            { id: 'analyze-folder', label: 'Analyser le dossier' },
          ],
          hideModelSelection: false,
        },
        showSignIn: !isAuthenticated && !isLoading,
      },
      localization: {
        locale: CHAT_UI_SUPPORTED_LOCALES.includes(AGENT_UI_LOCALE)
          ? AGENT_UI_LOCALE
          : "en-US",
      },
    }),
    [agenticPlatformAgent, environment, isAuthenticated, isLoading]
  );

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = await getAccessTokenSilently();
        // Appel à l'API Trimble Connect pour récupérer les projets
        const response = await fetch(`${TC_PROXY_URL}/projects`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            const projects = data.map((p: any) => ({ id: p.id, name: p.name }));
            setProjectsList(projects);
            
            // Si le projet actuel n'est pas dans la liste, on sélectionne le premier
            if (!projects.find((p: any) => p.id === currentProjectId)) {
              setCurrentProjectId(projects[0].id);
            }
          }
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des projets:", error);
      }
    };

    fetchProjects();
  }, [getAccessTokenSilently]);

    const handleIframeLoad = async () => {
      if (!viewerIframeRef.current) return;
      try {
        const token = await getAccessTokenSilently();
        const iframe = viewerIframeRef.current;

        postTrimbleConnectToken(iframe, token);

        setTimeout(() => {
          if (viewerIframeRef.current) {
            initWorkspaceApi(viewerIframeRef.current, token, currentProjectId, currentModule, requestedModelId ?? undefined).catch(e => {
              console.error("Failed to init Workspace API:", e);
            });
            if (requestedModelId) {
              setRequestedModelId(null);
            }
          }
        }, 500);

        setTimeout(() => {
          if (viewerIframeRef.current) {
            postTrimbleConnectToken(viewerIframeRef.current, token);
          }
        }, 3000);

        setTimeout(() => {
          if (viewerIframeRef.current) {
            postTrimbleConnectToken(viewerIframeRef.current, token);
          }
        }, 8000);
      } catch (error) {
        console.error("Failed to get token for viewer:", error);
      }
    };

    useEffect(() => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== TRIMBLE_CONNECT_ORIGIN) return;
        if (event.data?.type === 'token_request' || event.data?.type === 'getToken') {
          try {
            const token = await getAccessTokenSilently();
            postTrimbleConnectToken(viewerIframeRef.current, token);
          } catch (e) {
            console.error("Failed to respond to token request:", e);
          }
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [getAccessTokenSilently]);

    useEffect(() => {
      resetWorkspaceApi();
    }, [viewerIframeUrl, currentProjectId, currentModule]);

  const handleUnauthorized = useCallback(async () => {
    try {
      await getAccessTokenSilently();
      return "Session Trimble rafraîchie. Vous pouvez relancer votre demande.";
    } catch {
      return "Votre session Trimble a expiré. Merci de vous reconnecter avant de continuer.";
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!agentIframeRef.current || !isAgentOpen) {
      return;
    }

    // listenToChatUi initialise la communication et envoie la config initiale
    const unsubscribe = listenToChatUi(
      agentIframeRef.current,
      AGENT_IFRAME_ORIGIN,
      provideConfig,
      getAccessTokenSilently,
      onBeforeRun,
      handleUnauthorized
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [agenticPlatformAgent, getAccessTokenSilently, handleUnauthorized, isAgentOpen, agentIframeUrl, onBeforeRun, provideConfig]);

  useEffect(() => {
    if (!agentIframeRef.current || !isAgentOpen) return;

    try {
      updateConfig(agentIframeRef.current, AGENT_IFRAME_ORIGIN, provideConfig());
    } catch (error) {
      console.warn("Impossible de mettre à jour la configuration du Chat UI:", error);
    }
  }, [isAgentOpen, provideConfig]);

  const handleBcfFormSubmit = useCallback(async (data: BcfFormData) => {
    try {
      const result = await createBcfTopic(data, getAccessTokenSilently, currentProjectId);
      if (bcfFormResolveRef.current) {
        const success = !result?.error && result?.success !== false;
        bcfFormResolveRef.current(JSON.stringify({ success, ...result, formData: data }));
        bcfFormResolveRef.current = null;
      }
    } catch (e: any) {
      if (bcfFormResolveRef.current) {
        bcfFormResolveRef.current(JSON.stringify({ success: false, error: e.message }));
        bcfFormResolveRef.current = null;
      }
    }
    setShowBcfForm(false);
  }, [getAccessTokenSilently, currentProjectId]);

  const handleBcfFormCancel = useCallback(() => {
    if (bcfFormResolveRef.current) {
      bcfFormResolveRef.current(JSON.stringify({ cancelled: true, message: "L'utilisateur a annulé la création du BCF." }));
      bcfFormResolveRef.current = null;
    }
    setShowBcfForm(false);
  }, []);

  useEffect(() => {
    if (!isAgentOpen) return;
    const unsubscribe = listenToChatUiEvents(AGENT_IFRAME_ORIGIN, (event: ChatUiEvent) => {
      console.log("Chat UI Event:", event);
      if (event.type === ChatUiEventTypes.OnChatInputButtonClick) {
        if (event.payload === 'create-bcf') {
          setBcfFormPrefill({});
          bcfFormResolveRef.current = null;
          setShowBcfForm(true);
        }
        if (event.payload === 'analyze-folder') {
          setShowFolderAnalysis(true);
        }
      }
      if (event.type === ChatUiEventTypes.OnSignIn) {
        void getAccessTokenSilently();
      }
      if (event.type === ChatUiEventTypes.OnNewChat) {
        setShowBcfForm(false);
        setShowFolderAnalysis(false);
      }
      if (event.type === ChatUiEventTypes.OnClose) {
        setIsAgentOpen(false);
      }
    });
    return unsubscribe;
  }, [isAgentOpen, agentIframeUrl, getAccessTokenSilently]);

  // Sidebar navigation items
  const navItems: { id: string; label: string; icon: string }[] = [
    { id: 'projects', label: 'Tous les projets', icon: 'M10.5 6h9.75M10.5 12h9.75M10.5 18h9.75M3.75 6h.008v.008H3.75V6zm0 6h.008v.008H3.75V12zm0 6h.008v.008H3.75V18z' },
    { id: 'explorer', label: 'Navigateur', icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z' },
    { id: 'viewer3d', label: 'Viewer 3D', icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9' },
    { id: 'views3d', label: 'Vues 3D', icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z||M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'views2d', label: 'Vues 2D', icon: 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25' },
    { id: 'releases', label: 'Diffusions', icon: 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5' },
    { id: 'activity', label: 'Activités', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'bcf', label: 'Rubriques BCF', icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.84 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155' },
    { id: 'reality-capture', label: 'Reality Capture', icon: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z||M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z' },
    { id: 'dashboard', label: 'Dashboard', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5M3.75 3H2.25m18 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3M7.5 12l3-3 2.25 2.25L16.5 7.5' },
    { id: 'validation', label: 'Validation', icon: 'M3.75 12h16.5m-16.5 3.75h16.5M6.75 6.75h10.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5z||M8.25 9.75l1.5 1.5 3-3' },
    { id: 'notes', label: 'Notes', icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z' },
    { id: 'team', label: 'Équipe', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
    { id: 'groups', label: 'Bibliothèques de groupes...', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m0 12.75h7.5m-7.5 3h7.5M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  ];

  const settingsItems: { id: string; label: string; icon: string }[] = [
    { id: 'settings-details', label: 'Détails', icon: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' },
    { id: 'settings-permissions', label: 'Autorisations', icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z' },
    { id: 'settings-bcf', label: 'BCF Config', icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75' },
    { id: 'settings-extensions', label: 'Extensions', icon: 'M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z' },
    { id: 'settings-notifications', label: 'Notifications', icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0' },
    { id: 'settings-labels', label: 'Labels', icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z||M6 6h.008v.008H6V6z' },
    { id: 'settings-units', label: 'Unités', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5' },
    { id: 'settings-sync', label: 'Sync', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182' },
  ];

  const isSettingsActive = currentModule.startsWith('settings');

  const renderNavIcon = (iconData: string) => {
    const paths = iconData.split('||');
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px', flexShrink: 0 }}>
        {paths.map((d, i) => (
          <path key={i} strokeLinecap="round" strokeLinejoin="round" d={d} />
        ))}
      </svg>
    );
  };

  const sidebarW = sidebarExpanded ? 226 : 64;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      {/* Header */}
      <header style={{
        height: '52px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/trimble-connect-logo.png" alt="Trimble Connect" style={{ width: '32px', height: '32px', objectFit: 'contain', filter: 'brightness(1.3) saturate(1.2) drop-shadow(0 0 6px rgba(56,189,248,0.3))' }} />
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Trimble Connect</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.1)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(14,165,233,0.2)' }}>IA Platform</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projet</span>
          <select
            value={currentProjectId}
            onChange={(e) => setCurrentProjectId(e.target.value)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e2e8f0',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '8px',
              padding: '6px 32px 6px 12px',
              minWidth: '280px',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none' as const,
              backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px top 50%',
              backgroundSize: '10px auto',
            }}
          >
            {projectsList.map((project) => (
              <option key={project.id} value={project.id} style={{ backgroundColor: '#1e293b', color: '#e2e8f0' }}>
                {project.name || 'Projet sans nom'}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main container */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', width: '100%', overflow: 'hidden' }}>

        {/* Sidebar */}
        <nav style={{
          width: `${sidebarW}px`,
          background: 'linear-gradient(180deg, #082f49 0%, #0f172a 46%, #07111f 100%)',
          borderRight: '1px solid rgba(125,211,252,0.18)',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
          flexShrink: 0,
          zIndex: 50,
          overflowY: 'auto',
          overflowX: 'hidden',
          gap: '2px',
          transition: 'width 0.25s cubic-bezier(.4,0,.2,1)',
          boxShadow: 'inset -1px 0 0 rgba(14,165,233,0.12), 10px 0 30px rgba(2,6,23,0.18)',
        }}>
          {/* Toggle button */}
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            title={sidebarExpanded ? 'Réduire' : 'Déplier'}
            style={{
              width: sidebarExpanded ? 'calc(100% - 12px)' : '44px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid rgba(125,211,252,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarExpanded ? 'flex-end' : 'center',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(14,165,233,0.18), rgba(59,130,246,0.08))',
              color: '#7dd3fc',
              margin: sidebarExpanded ? '0 6px 6px' : '0 auto 6px',
              padding: sidebarExpanded ? '0 8px' : '0',
              transition: 'all 0.2s',
              boxShadow: '0 0 16px rgba(14,165,233,0.12)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(14,165,233,0.28), rgba(59,130,246,0.16))'; e.currentTarget.style.color = '#e0f2fe'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(14,165,233,0.18), rgba(59,130,246,0.08))'; e.currentTarget.style.color = '#7dd3fc'; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px', transition: 'transform 0.25s', transform: sidebarExpanded ? 'rotate(0deg)' : 'rotate(180deg)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
            </svg>
          </button>

          {navItems.map((item) => {
            const isActive = currentModule === item.id;
            return (
              <div key={item.id} style={{ position: 'relative', width: '100%', padding: '0 6px' }}>
                <button
                  onClick={() => setCurrentModule(item.id)}
                  title={sidebarExpanded ? undefined : item.label}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '10px',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    position: 'relative',
                    padding: sidebarExpanded ? '0 12px' : '0',
                    justifyContent: sidebarExpanded ? 'flex-start' : 'center',
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(14,165,233,0.24), rgba(37,99,235,0.12))'
                      : 'transparent',
                    color: isActive ? '#e0f7ff' : '#b7dbf5',
                    boxShadow: isActive ? 'inset 0 0 0 1px rgba(125,211,252,0.24), 0 0 18px rgba(14,165,233,0.14)' : 'none',
                  }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(125,211,252,0.08)'; e.currentTarget.style.color = '#e0f2fe'; e.currentTarget.style.transform = 'translateX(2px)'; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b7dbf5'; e.currentTarget.style.transform = 'translateX(0)'; } }}
                >
                  {isActive && (
                    <div style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', width: '3px', height: '22px', borderRadius: '0 3px 3px 0', background: 'linear-gradient(180deg, #67e8f9, #0ea5e9)', boxShadow: '0 0 12px rgba(14,165,233,0.75)' }} />
                  )}
                  <span style={{ flexShrink: 0, display: 'flex', filter: isActive ? 'drop-shadow(0 0 6px rgba(125,211,252,0.6))' : 'drop-shadow(0 0 3px rgba(14,165,233,0.18))' }}>{renderNavIcon(item.icon)}</span>
                  {sidebarExpanded && (
                    <span style={{ fontSize: '13px', fontWeight: isActive ? 700 : 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em', textShadow: isActive ? '0 0 10px rgba(125,211,252,0.45)' : '0 0 8px rgba(14,165,233,0.18)' }}>{item.label}</span>
                  )}
                </button>
              </div>
            );
          })}

          {/* Separator */}
          <div style={{ width: sidebarExpanded ? 'calc(100% - 24px)' : '24px', height: '1px', backgroundColor: 'rgba(255,255,255,0.06)', margin: '8px auto' }} />

          {/* Settings toggle */}
          <div style={{ position: 'relative', width: '100%', padding: '0 6px' }}>
            <button
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              title={sidebarExpanded ? undefined : 'Paramètres'}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: '10px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
                padding: sidebarExpanded ? '0 12px' : '0',
                justifyContent: sidebarExpanded ? 'flex-start' : 'center',
                background: isSettingsActive
                  ? 'linear-gradient(135deg, rgba(14,165,233,0.24), rgba(37,99,235,0.12))'
                  : 'transparent',
                color: isSettingsActive ? '#e0f7ff' : '#b7dbf5',
                boxShadow: isSettingsActive ? 'inset 0 0 0 1px rgba(125,211,252,0.24), 0 0 18px rgba(14,165,233,0.14)' : 'none',
              }}
              onMouseEnter={(e) => { if (!isSettingsActive) { e.currentTarget.style.background = 'rgba(125,211,252,0.08)'; e.currentTarget.style.color = '#e0f2fe'; e.currentTarget.style.transform = 'translateX(2px)'; } }}
              onMouseLeave={(e) => { if (!isSettingsActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b7dbf5'; e.currentTarget.style.transform = 'translateX(0)'; } }}
            >
              {isSettingsActive && (
                <div style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', width: '3px', height: '22px', borderRadius: '0 3px 3px 0', background: 'linear-gradient(180deg, #67e8f9, #0ea5e9)', boxShadow: '0 0 12px rgba(14,165,233,0.75)' }} />
              )}
              <span style={{ flexShrink: 0, display: 'flex', filter: isSettingsActive ? 'drop-shadow(0 0 6px rgba(125,211,252,0.6))' : 'drop-shadow(0 0 3px rgba(14,165,233,0.18))' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              {sidebarExpanded && (
                <>
                  <span style={{ fontSize: '13px', fontWeight: isSettingsActive ? 700 : 550, flex: 1, textAlign: 'left', letterSpacing: '0.01em', textShadow: isSettingsActive ? '0 0 10px rgba(125,211,252,0.45)' : '0 0 8px rgba(14,165,233,0.18)' }}>Paramètres</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '14px', height: '14px', transition: 'transform 0.2s', transform: isSettingsExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
            </button>
          </div>

          {/* Settings sub-items (inline when expanded, flyout when collapsed) */}
          {isSettingsExpanded && sidebarExpanded && (
            <div style={{ padding: '2px 6px 2px 20px' }}>
              {settingsItems.map((item) => {
                const isActive = currentModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentModule(item.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? 'rgba(14,165,233,0.16)' : 'transparent',
                      color: isActive ? '#e0f7ff' : '#a7d8f0',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(125,211,252,0.08)'; e.currentTarget.style.color = '#e0f2fe'; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a7d8f0'; } }}
                  >
                    {renderNavIcon(item.icon)}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {isSettingsExpanded && !sidebarExpanded && (
            <div style={{
              position: 'absolute',
              left: '64px',
              bottom: '12px',
              width: '180px',
              background: 'linear-gradient(180deg, #0f2f4a, #111827)',
              border: '1px solid rgba(125,211,252,0.2)',
              borderRadius: '12px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 26px rgba(14,165,233,0.12)',
              padding: '6px',
              zIndex: 100,
            }}>
              <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 700, color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Paramètres</div>
              {settingsItems.map((item) => {
                const isActive = currentModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setCurrentModule(item.id); setIsSettingsExpanded(false); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? 'rgba(14,165,233,0.16)' : 'transparent',
                      color: isActive ? '#e0f7ff' : '#a7d8f0',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(125,211,252,0.08)'; e.currentTarget.style.color = '#e0f2fe'; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a7d8f0'; } }}
                  >
                    {renderNavIcon(item.icon)}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Settings flyout click-away (collapsed mode only) */}
        {isSettingsExpanded && !sidebarExpanded && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setIsSettingsExpanded(false)} />}

        {/* Main content */}
        <div style={{ flex: 1, position: 'relative', zIndex: 0, borderRadius: '12px 0 0 0', overflow: 'hidden', margin: '0' }}>
          {isAuthenticated && !isLoading && (
            <iframe
              key={`${currentProjectId}-${currentModule}`}
              ref={viewerIframeRef}
              src={viewerIframeUrl}
              onLoad={handleIframeLoad}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              title="Trimble Connect"
            />
          )}

          {/* Agent floating button */}
          {!isAgentOpen && (
            <div style={{ position: 'absolute', bottom: '20px', right: '20px', zIndex: 1001, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
              {/* Analyze folder button - visible on explorer module */}
              {currentModule === 'explorer' && (
                <button
                  onClick={() => { setIsAgentOpen(true); setIsVoiceMode(false); setShowFolderAnalysis(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '11px 16px 11px 12px', borderRadius: '18px', border: '1px solid rgba(125,211,252,0.34)',
                    background: selectedExplorerItem && selectedExplorerItem.type === 'FOLDER'
                      ? 'radial-gradient(circle at 18% 16%, rgba(125,211,252,0.28), transparent 28%), linear-gradient(145deg, rgba(8,47,73,0.96), rgba(15,23,42,0.98) 58%, rgba(2,6,23,0.98))'
                      : 'radial-gradient(circle at 18% 16%, rgba(125,211,252,0.2), transparent 28%), linear-gradient(145deg, rgba(8,47,73,0.92), rgba(15,23,42,0.98) 58%, rgba(2,6,23,0.98))',
                    boxShadow: selectedExplorerItem && selectedExplorerItem.type === 'FOLDER'
                      ? '0 18px 34px rgba(2,6,23,0.46), 0 0 24px rgba(14,165,233,0.28), inset 0 1px 0 rgba(255,255,255,0.14)'
                      : '0 14px 28px rgba(2,6,23,0.42), 0 0 18px rgba(14,165,233,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
                    color: '#d9f3ff', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.3s',
                    maxWidth: '280px',
                    backdropFilter: 'blur(10px)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.03) perspective(800px) rotateX(5deg)'; e.currentTarget.style.boxShadow = '0 24px 44px rgba(2,6,23,0.5), 0 0 30px rgba(14,165,233,0.34), inset 0 1px 0 rgba(255,255,255,0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
                  title={selectedExplorerItem && selectedExplorerItem.type === 'FOLDER'
                    ? `Analyser automatiquement le dossier "${selectedExplorerItem.name}"`
                    : "Ouvrir l'analyseur de dossier (sélectionne d'abord un dossier ou tape son nom)"}
                >
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'linear-gradient(145deg, rgba(14,165,233,0.18), rgba(15,23,42,0.72))',
                    color: '#7dd3fc',
                    boxShadow: 'inset 0 0 0 1px rgba(125,211,252,0.28), 0 6px 12px rgba(2,6,23,0.35), 0 0 14px rgba(14,165,233,0.22)',
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                      <path d="M3.75 7.5h5.1a1.5 1.5 0 011.06.44l1.15 1.12a1.5 1.5 0 001.05.44h8.14" />
                      <path d="M4.5 6h4.35a1.5 1.5 0 011.06.44l1.15 1.12a1.5 1.5 0 001.05.44H19.5a1.5 1.5 0 011.5 1.5v6.75a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 16.25V7.5A1.5 1.5 0 014.5 6z" />
                      <path d="M15.75 12.75l1.05-1.05 1.05 1.05m-1.05-1.05v4.05" />
                      <path d="M8.25 14.25h4.5" />
                    </svg>
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedExplorerItem && selectedExplorerItem.type === 'FOLDER'
                      ? `Analyser « ${selectedExplorerItem.name} »`
                      : 'Analyser le dossier'}
                  </span>
                </button>
              )}
              <ModusWcTooltip content="Trimble Assist" position="left">
                <button
                  onClick={() => setIsAgentOpen(true)}
                  style={{
                    width: '60px', height: '60px', borderRadius: '20px', border: '1px solid rgba(125,211,252,0.36)',
                    background: 'radial-gradient(circle at 28% 22%, rgba(125,211,252,0.26), transparent 28%), linear-gradient(145deg, rgba(8,47,73,0.96), rgba(15,23,42,0.98) 58%, rgba(2,6,23,0.98))',
                    boxShadow: '0 20px 38px rgba(2,6,23,0.48), 0 0 24px rgba(14,165,233,0.24), inset 0 1px 0 rgba(255,255,255,0.14)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.3s',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-6px) scale(1.05) perspective(800px) rotateX(6deg) rotateY(-3deg)'; e.currentTarget.style.boxShadow = '0 28px 50px rgba(2,6,23,0.55), 0 0 34px rgba(14,165,233,0.34), inset 0 1px 0 rgba(255,255,255,0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 20px 38px rgba(2,6,23,0.48), 0 0 24px rgba(14,165,233,0.24), inset 0 1px 0 rgba(255,255,255,0.14)'; }}
                >
                  <span style={{ position: 'absolute', inset: '7px', borderRadius: '16px', border: '1px solid rgba(125,211,252,0.22)' }} />
                  <span style={{ position: 'absolute', width: '38px', height: '38px', borderRadius: '999px', background: 'rgba(14,165,233,0.13)', filter: 'blur(3px)' }} />
                  <img
                    src="/trimble-assist-icon.svg"
                    alt="Trimble Assist"
                    style={{ width: '35px', height: '35px', position: 'relative', filter: 'drop-shadow(0 0 8px rgba(125,211,252,0.52))' }}
                  />
                </button>
              </ModusWcTooltip>
            </div>
          )}

          {/* Agent panel */}
          {isAgentOpen && (
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: '400px', zIndex: 1000,
              backgroundColor: '#ffffff',
              boxShadow: '-8px 0 30px rgba(0,0,0,0.15)',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Agent header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '9px', background: 'linear-gradient(145deg, #082f49, #0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(14,165,233,0.28), inset 0 0 0 1px rgba(125,211,252,0.22)' }}>
                    <img src="/trimble-assist-icon.svg" alt="Trimble Assist" style={{ width: '20px', height: '20px', filter: 'drop-shadow(0 0 5px rgba(125,211,252,0.45))' }} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#f1f5f9' }}>Trimble Assist</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => setIsVoiceMode(!isVoiceMode)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                      border: 'none',
                      backgroundColor: isVoiceMode ? '#0ea5e9' : 'rgba(255,255,255,0.08)',
                      color: isVoiceMode ? '#ffffff' : '#94a3b8',
                      transition: 'all 0.2s',
                    }}
                    title={isVoiceMode ? 'Retour au chat texte' : 'Activer le mode vocal'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                    {isVoiceMode ? 'Texte' : 'Vocal'}
                  </button>
                  <button
                    onClick={() => { setIsAgentOpen(false); setIsVoiceMode(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '28px', height: '28px', borderRadius: '6px', border: 'none',
                      backgroundColor: 'transparent', cursor: 'pointer', color: '#64748b',
                    }}
                    title="Fermer"
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              </div>
              {isVoiceMode ? (
                <VoiceAssistant
                  agentId={agenticPlatformAgent}
                  getAccessToken={getAccessTokenSilently}
                  isVisible={true}
                  onClose={() => setIsVoiceMode(false)}
                />
              ) : (
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <iframe
                    ref={agentIframeRef}
                    src={agentIframeUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Trimble Assist Agent"
                    allow="clipboard-read; clipboard-write; microphone"
                  />
                  <BcfCreationForm
                    isVisible={showBcfForm}
                    prefillData={bcfFormPrefill}
                    projectId={currentProjectId}
                    getAccessToken={getAccessTokenSilently}
                    proxyUrl={TC_PROXY_URL}
                    onSubmit={handleBcfFormSubmit}
                    onCancel={handleBcfFormCancel}
                  />
                  <FolderAnalysisPanel
                    isVisible={showFolderAnalysis}
                    projectId={currentProjectId}
                    projectName={projectsList.find(p => p.id === currentProjectId)?.name || 'Projet courant'}
                    agentId={agenticPlatformAgent}
                    getAccessToken={getAccessTokenSilently}
                    selectedItem={selectedExplorerItem}
                    onOpenModel3D={openModel3DInViewer}
                    onClose={() => setShowFolderAnalysis(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  }
  
  export default App;