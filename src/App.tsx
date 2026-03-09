import { useState, useRef, useEffect } from 'react';
import { useTrimbleConnect, TrimbleProvider } from './hooks/useTrimbleConnect';
import { 
  listenToChatUi, 
  CHAT_UI_URLS, 
  ContentVariants, 
  ChatUiVariants,
  type OnBeforeRunConfig
} from './sdk/agentic-iframe-sdk';

function AgentChat() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isConnected, api, project } = useTrimbleConnect();
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  useEffect(() => {
    if (!iframeRef.current || !isConnected) return;

    const environment = 'stage' as const; // ou 'prod' selon l'environnement
    const chatUiUrl = CHAT_UI_URLS[environment];

    const getConfig = () => ({
      environment,
      agentId: '94c9271b-99ea-4a38-97f7-8ad14c40de52', // ID extrait de l'URL du Studio
      uiConfig: {
        theme: 'light' as const,
        contentVariant: ContentVariants.Chat,
        variant: ChatUiVariants.Full,
        chatInput: {
          buttons: [],
          hideModelSelection: false, // <-- Changé pour forcer l'affichage
        },
      },
      localization: {
        selectedLanguage: 'fr',
      },
    });

    const getToken = async () => {
      // Si on est dans l'iframe Trimble Connect, le token est géré par WorkspaceAPI
      if (api) {
         return await api.extension.requestPermission('accesstoken');
      }
      return 'mock-token';
    };

    const onBeforeRun: OnBeforeRunConfig = {
      tools: {
        runTime: {
          get_selected_objects: {
            definition: {
              name: 'get_selected_objects',
              description: 'Récupère les propriétés des objets actuellement sélectionnés dans la maquette 3D.',
              parameters: { type: 'object', properties: {} }
            },
            callback: async () => {
              addLog(`Agent Tool: get_selected_objects`);
              if (!api) return 'Erreur: API non disponible';
              try {
                const selection = await api.viewer.getSelection();
                if (!selection.length) return 'Aucun objet sélectionné.';
                
                const { modelId, objectRuntimeIds } = selection[0];
                const props = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
                return JSON.stringify(props);
              } catch (e) {
                return 'Erreur lors de la récupération des objets.';
              }
            }
          },
          get_all_models: {
            definition: {
              name: 'get_all_models',
              description: 'Récupère la liste de tous les modèles 3D actuellement chargés dans la vue.',
              parameters: { type: 'object', properties: {} }
            },
            callback: async () => {
              addLog(`Agent Tool: get_all_models`);
              if (!api) return 'Erreur: API non disponible';
              try {
                const models = await api.viewer.getModels('loaded');
                return JSON.stringify(models);
              } catch (e) {
                return 'Erreur lors de la récupération des modèles.';
              }
            }
          },
          isolate_objects: {
            definition: {
              name: 'isolate_objects',
              description: 'Isole visuellement les objets spécifiés (cache tout le reste).',
              parameters: {
                type: 'object',
                properties: {
                  runtimeIds: { type: 'array', items: { type: 'number' } },
                  modelId: { type: 'string' }
                },
                required: ['runtimeIds', 'modelId']
              }
            },
            callback: async (args: any) => {
              addLog(`Agent Tool: isolate_objects(${JSON.stringify(args)})`);
              if (!api) return 'API indisponible';
              try {
                await api.viewer.isolateEntities([{
                  modelId: args.modelId,
                  objectRuntimeIds: args.runtimeIds
                }]);
                return 'Objets isolés avec succès.';
              } catch (e) {
                return 'Erreur lors de l\'isolation.';
              }
            }
          },
          color_objects: {
            definition: {
              name: 'color_objects',
              description: 'Change la couleur des objets spécifiés dans la maquette 3D.',
              parameters: {
                type: 'object',
                properties: {
                  runtimeIds: { type: 'array', items: { type: 'number' } },
                  modelId: { type: 'string' },
                  colorHex: { type: 'string', description: 'Couleur en hex (ex: #FF0000)' }
                },
                required: ['runtimeIds', 'modelId', 'colorHex']
              }
            },
            callback: async (args: any) => {
              addLog(`Agent Tool: color_objects(${JSON.stringify(args)})`);
              if (!api) return 'API indisponible';
              try {
                await api.viewer.setObjectState({ 
                    modelObjectIds: [{ modelId: args.modelId, objectRuntimeIds: args.runtimeIds }] 
                  }, 
                  { color: args.colorHex }
                );
                return 'Couleur appliquée.';
              } catch (e) {
                return 'Erreur lors de la coloration.';
              }
            }
          },
          create_bcf_topic: {
            definition: {
              name: 'create_bcf_topic',
              description: 'Crée un nouveau sujet BCF avec un point de vue (caméra) et une capture décran automatique.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['Low', 'Normal', 'High'] },
                  assigned_to: { type: 'string', description: 'Email de l\'assigné' }
                },
                required: ['title']
              }
            },
            callback: async (args: any) => {
              addLog(`Agent Tool: create_bcf_topic(${JSON.stringify(args)})`);
              if (!api || !project) return 'API indisponible';
              try {
                // Prendre une capture d'écran
                const snapshot = await api.viewer.getSnapshot();
                // Otenir la caméra
                const camera = await api.viewer.getCamera();
                
                const token = await api.extension.requestPermission('accesstoken');
                
                const payload = {
                  title: args.title,
                  description: args.description || '',
                  priority: args.priority || 'Normal',
                  assigned_to: args.assigned_to,
                  topic_type: 'Issue',
                  topic_status: 'Open',
                  snapshot: snapshot,
                  viewpoint: {
                    perspective_camera: {
                      camera_view_point: camera.position,
                      camera_direction: camera.target, // a simplifier pour l'exemple
                      camera_up_vector: camera.up,
                      field_of_view: 45
                    }
                  }
                };

                const backendUrl = import.meta.env.PROD ? 'https://trimble-agent-extension.vercel.app' : 'http://localhost:3001';
                const res = await fetch(`${backendUrl}/api/projects/${project.id}/bcf/topics`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Project-Region': project.location,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(payload)
                });
                
                if (!res.ok) throw new Error('Failed to create BCF');
                const data = await res.json();
                return `BCF créé avec succès (ID: ${data.guid})`;
              } catch (e: any) {
                return `Erreur lors de la création du BCF: ${e.message}`;
              }
            }
          },
          list_bcf_topics: {
            definition: {
              name: 'list_bcf_topics',
              description: 'Récupère la liste des BCF (sujets/tickets) ouverts sur le projet.',
              parameters: { type: 'object', properties: {} }
            },
            callback: async () => {
              addLog(`Agent Tool: list_bcf_topics`);
              if (!project) return 'Projet non identifié';
              
              // Si on est en mode dev local (pas de token), on renvoie des mock data
              const token = api ? await api.extension.requestPermission('accesstoken') : 'mock-token';
              if (token === 'mock-token') {
                return JSON.stringify([{
                  guid: 'bcf-123',
                  title: 'Mur sans Fire Rating',
                  topic_status: 'Open',
                  priority: 'High'
                }]);
              }

              try {
                const backendUrl = import.meta.env.PROD ? 'https://trimble-agent-extension.vercel.app' : 'http://localhost:3001';
                const res = await fetch(`${backendUrl}/api/projects/${project.id}/bcf/topics`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Project-Region': project.location
                  }
                });
                if (!res.ok) throw new Error('API Error');
                const data = await res.json();
                return JSON.stringify(data);
              } catch (e: any) {
                return `Erreur lors de la récupération des BCF: ${e.message}`;
              }
            }
          },
          update_bcf_status: {
            definition: {
              name: 'update_bcf_status',
              description: 'Met à jour le statut dun BCF existant.',
              parameters: {
                type: 'object',
                properties: {
                  topic_id: { type: 'string', description: 'Le GUID du BCF à modifier' },
                  status: { type: 'string', enum: ['Open', 'In Progress', 'Resolved', 'Closed'] }
                },
                required: ['topic_id', 'status']
              }
            },
            callback: async (args: any) => {
              addLog(`Agent Tool: update_bcf_status(${JSON.stringify(args)})`);
              if (!project) return 'Projet non identifié';
              
              const token = api ? await api.extension.requestPermission('accesstoken') : 'mock-token';
              if (token === 'mock-token') {
                return `[MOCK] BCF ${args.topic_id} mis à jour avec le statut ${args.status}`;
              }

              try {
                const backendUrl = import.meta.env.PROD ? 'https://trimble-agent-extension.vercel.app' : 'http://localhost:3001';
                const res = await fetch(`${backendUrl}/api/projects/${project.id}/bcf/topics/${args.topic_id}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Project-Region': project.location,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ topic_status: args.status })
                });
                if (!res.ok) throw new Error('API Error');
                return `BCF ${args.topic_id} mis à jour avec succès.`;
              } catch (e: any) {
                return `Erreur lors de la mise à jour: ${e.message}`;
              }
            }
          },
          reset_view: {
            definition: {
              name: 'reset_view',
              description: 'Réinitialise la vue 3D: annule l\'isolation des objets, réinitialise leurs couleurs et recadre la caméra par défaut.',
              parameters: { type: 'object', properties: {} }
            },
            callback: async () => {
              addLog(`Agent Tool: reset_view`);
              if (!api) return 'API indisponible';
              try {
                // 1. Réafficher tous les objets (annuler isolateEntities)
                // L'API Workspace isole en cachant les autres. On force la visibilité de tout:
                await api.viewer.setObjectState(undefined, { visible: true });
                
                // 2. Enlever toutes les couleurs appliquées
                await api.viewer.setObjectState(undefined, { color: null });
                
                // 3. Réinitialiser la caméra
                await api.viewer.setCamera('reset');
                
                return 'Vue 3D réinitialisée avec succès.';
              } catch (e: any) {
                return `Erreur lors de la réinitialisation: ${e.message}`;
              }
            }
          }
        },
        global: {}
      },
      runContext: {
        context: [
          { description: 'Projet actuel', value: project?.name || 'Inconnu' },
          { description: 'Region', value: project?.location || 'Inconnu' }
        ]
      }
    };

    const cleanup = listenToChatUi(
      iframeRef.current,
      chatUiUrl,
      getConfig,
      getToken,
      onBeforeRun
    );

    return () => cleanup();
  }, [isConnected, api, project]);

  return (
    <div className="flex h-full w-full relative">
      {/* Panneau de l'Iframe Chat */}
      <div className="flex-1 w-full h-full">
        <iframe 
          ref={iframeRef} 
          src={CHAT_UI_URLS['stage']} 
          className="w-full h-full border-none"
          title="Trimble Assist"
        />
      </div>

      {/* Overlay de logs (pour le débug en local) */}
      <div className="absolute top-0 right-0 w-[450px] h-full p-4 pointer-events-none">
        <div className="bg-black/80 text-white rounded-lg p-3 h-full overflow-y-auto pointer-events-auto text-xs shadow-xl backdrop-blur-sm">
          <h3 className="font-bold mb-2 text-blue-400 border-b border-gray-700 pb-1">Logs Extension</h3>
          {logs.length === 0 ? (
            <p className="text-gray-400 italic">En attente des appels de l'agent...</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="font-mono break-words border-b border-gray-800 pb-1">
                  <span className="text-gray-400 mr-2">{log.split(' - ')[0]}</span>
                  <span className="text-green-300">{log.substring(log.indexOf(' - ') + 3)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const trimbleState = useTrimbleConnect();

  return (
    <TrimbleProvider value={trimbleState}>
      <div className="flex h-screen w-full bg-white">
        {!trimbleState.isConnected ? (
          <div className="flex items-center justify-center w-full">
            <p className="text-gray-500">Connexion à Trimble Connect en cours...</p>
          </div>
        ) : (
          <AgentChat />
        )}
      </div>
    </TrimbleProvider>
  );
}
