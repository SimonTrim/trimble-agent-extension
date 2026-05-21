import * as WorkspaceAPI from "trimble-connect-workspace-api";
import { postTrimbleConnectToken } from "./agentRuntimeConfig";

const PROXY_URL = 'https://trimble-agent-extension.vercel.app';

let workspaceApi: WorkspaceAPI.WorkspaceAPI | null = null;

export interface SelectedExplorerItem {
  id: string;
  name: string;
  type: "FILE" | "FOLDER";
  versionId?: string;
}

let selectedExplorerItem: SelectedExplorerItem | null = null;
const selectionListeners = new Set<(item: SelectedExplorerItem | null) => void>();

export const getSelectedExplorerItem = (): SelectedExplorerItem | null => selectedExplorerItem;

export const onExplorerSelectionChange = (cb: (item: SelectedExplorerItem | null) => void): (() => void) => {
  selectionListeners.add(cb);
  return () => { selectionListeners.delete(cb); };
};

const setSelectedExplorerItem = (item: SelectedExplorerItem | null) => {
  selectedExplorerItem = item;
  selectionListeners.forEach((cb) => {
    try { cb(item); } catch (e) { console.error("Selection listener error:", e); }
  });
};

export const resetWorkspaceApi = () => {
  workspaceApi = null;
  setSelectedExplorerItem(null);
};

/**
 * Initialise la connexion avec le composant embarqué de Trimble Connect
 */
export const initWorkspaceApi = async (
  iframeElement: HTMLIFrameElement, 
  accessToken: string, 
  projectId: string, 
  module: string,
  modelId?: string
) => {
  if (workspaceApi) return workspaceApi;

  const sendTokenViaPostMessage = () => {
    try {
      postTrimbleConnectToken(iframeElement, accessToken);
      console.log(`Token envoyé via postMessage pour le module ${module}`);
    } catch (e) {
      console.error("Erreur postMessage:", e);
    }
  };

  sendTokenViaPostMessage();

  try {
    workspaceApi = await WorkspaceAPI.connect(
      iframeElement,
      (event: any, args: any) => {
        console.log("Workspace API Event:", event, args);

        try {
          const extractItem = (data: any): SelectedExplorerItem | null => {
            if (!data || typeof data !== "object") return null;

            if (data.id && data.name && (data.type === "FILE" || data.type === "FOLDER")) {
              return { id: data.id, name: data.name, type: data.type, versionId: data.versionId };
            }

            if (data.id && data.name && data.hasChildren !== undefined) {
              return { id: data.id, name: data.name, type: "FOLDER" };
            }

            if (data.id && data.name && (data.revision !== undefined || data.size !== undefined)) {
              const t = data.type === "FOLDER" ? "FOLDER" : "FILE";
              return { id: data.id, name: data.name, type: t, versionId: data.versionId };
            }

            if (data.file && typeof data.file === "object" && data.file.id && data.file.name) {
              const t = data.file.type === "FOLDER" ? "FOLDER" : "FILE";
              return { id: data.file.id, name: data.file.name, type: t, versionId: data.file.versionId };
            }

            if (Array.isArray(data.files) && data.files.length > 0) {
              const f = data.files[0];
              if (f && f.id && f.name) {
                const t = f.type === "FOLDER" ? "FOLDER" : "FILE";
                return { id: f.id, name: f.name, type: t, versionId: f.versionId };
              }
            }

            if (Array.isArray(data) && data.length > 0) {
              return extractItem(data[0]);
            }

            return null;
          };

          const data = args?.data;
          const item = extractItem(data);

          if (item) {
            console.log(`[workspaceApi] Explorer selection captured from '${event}':`, item);
            setSelectedExplorerItem(item);
          } else if (event === "embed.onAction" && data && data.path && data.name) {
            console.log(`[workspaceApi] Breadcrumb navigation detected:`, data);
          }
        } catch (e) {
          console.error("Error handling workspace event:", e);
        }
      },
      20000
    );
    console.log("✅ Connecté au Workspace API de Trimble Connect (Embedded)");

    await workspaceApi.embed.setTokens({ accessToken });
    console.log(`✅ Token injecté via setTokens pour le module ${module}`);

    if (module === 'viewer3d') {
      await workspaceApi.embed.init3DViewer({
        projectId: projectId,
        modelId: modelId,
      });
    } else if (module === 'explorer') {
      await workspaceApi.embed.initFileExplorer({
        projectId: projectId,
      });
    }

    sendTokenViaPostMessage();

    return workspaceApi;
  } catch (error) {
    console.error("❌ Erreur de connexion au Workspace API:", error);
    sendTokenViaPostMessage();
    return null;
  }
};

/**
 * Récupère les objets actuellement sélectionnés dans le Viewer 3D
 * et leurs propriétés.
 */
export const getSelectedObjects = async () => {
  if (!workspaceApi) {
    console.warn("Workspace API non initialisé");
    return { error: "Non connecté au Viewer 3D" };
  }

  try {
    // 1. Récupérer la sélection courante (IDs des objets)
    const selection = await workspaceApi.viewer.getSelection();
    
    if (!selection || selection.length === 0) {
      return { message: "Aucun objet sélectionné dans la maquette." };
    }

    // 2. Récupérer les propriétés détaillées de ces objets
    const propertiesPromises = selection.map(sel => 
      workspaceApi!.viewer.getObjectProperties(sel.modelId, sel.objectRuntimeIds || [])
    );
    const properties = await Promise.all(propertiesPromises);
    
    return {
      count: selection.reduce((acc: number, curr: any) => acc + (curr.objectRuntimeIds?.length || 0), 0),
      selection: selection,
      properties: properties
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des objets:", error);
    return { error: "Erreur lors de la lecture de la maquette" };
  }
};

/**
 * Isole visuellement une liste d'objets dans la vue 3D
 */
export const isolateObjects = async (runtimeIds: number[], modelId: string) => {
  if (!workspaceApi) return false;
  
  try {
    const entitiesToIsolate = [{
      modelId: modelId,
      entityIds: runtimeIds
    }];
    await workspaceApi.viewer.isolateEntities(entitiesToIsolate);
    return true;
  } catch (error) {
    console.error("Erreur lors de l'isolation des objets:", error);
    return false;
  }
};

/**
 * Change la couleur des objets spécifiés
 */
export const colorObjects = async (runtimeIds: number[], modelId: string, colorHex: string) => {
  if (!workspaceApi) return false;
  
  try {
    const selector = {
      modelObjectIds: [{
        modelId: modelId,
        objectRuntimeIds: runtimeIds
      }]
    };
    
    const state = {
      color: colorHex
    };
    
    await workspaceApi.viewer.setObjectState(selector, state);
    return true;
  } catch (error) {
    console.error("Erreur lors de la coloration des objets:", error);
    return false;
  }
};

/**
 * Réinitialise la vue 3D (couleurs et visibilité)
 */
export const resetView = async () => {
  if (!workspaceApi) return false;
  
  try {
    // undefined selector means ALL objects
    const selector = undefined;
    const state = {
      color: "reset" as any,
      visible: "reset" as any
    };
    
    await workspaceApi.viewer.setObjectState(selector, state);
    return true;
  } catch (error) {
    console.error("Erreur lors de la réinitialisation de la vue:", error);
    return false;
  }
};

/**
 * Liste les BCF topics d'un projet via le proxy Vercel.
 */
export const listBcfTopics = async (
  projectId: string,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `https://trimble-agent-extension.vercel.app/api/projects/${projectId}/bcf/topics`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    const topics = await response.json();
    console.log(`✅ ${topics.length} BCF topics récupérés`);

    const lightTopics = topics.map((t: any) => ({
      guid: t.guid,
      title: t.title,
      status: t.topic_status,
      priority: t.priority,
      type: t.topic_type,
      assigned_to: t.assigned_to,
      created: t.creation_date?.substring(0, 10),
      modified: t.modified_date?.substring(0, 10),
    }));

    const MAX_TOPICS = 30;
    const truncated = lightTopics.length > MAX_TOPICS;
    const returnedTopics = truncated ? lightTopics.slice(0, MAX_TOPICS) : lightTopics;

    return {
      success: true,
      total: lightTopics.length,
      showing: returnedTopics.length,
      truncated,
      note: truncated ? `Seuls les ${MAX_TOPICS} premiers BCF sont affichés. Demandez une recherche plus ciblée si besoin.` : undefined,
      topics: returnedTopics,
    };
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération des BCF:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Met à jour un BCF topic existant via le proxy Vercel.
 */
export const updateBcfTopic = async (
  projectId: string,
  topicId: string,
  updateData: Record<string, any>,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `https://trimble-agent-extension.vercel.app/api/projects/${projectId}/bcf/topics/${topicId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ BCF update failed:", response.status, errorText, "Data sent:", JSON.stringify(updateData));
      const hint = response.status === 500 || response.status === 400
        ? " Utilisez get_bcf_extensions pour récupérer les statuts, priorités et types valides configurés dans ce projet."
        : "";
      throw new Error(`Erreur API BCF (${response.status}): ${errorText}.${hint}`);
    }

    const updatedTopic = await response.json();
    console.log("✅ BCF topic mis à jour:", updatedTopic.guid);
    return {
      success: true,
      topic: {
        guid: updatedTopic.guid,
        title: updatedTopic.title,
        status: updatedTopic.topic_status,
        priority: updatedTopic.priority,
      },
    };
  } catch (error: any) {
    console.error("❌ Erreur lors de la mise à jour du BCF:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Crée un BCF via le proxy Vercel, en y attachant automatiquement 
 * la vue 3D actuelle (caméra) et une capture d'écran.
 */
export const createBcfTopic = async (
  topicData: any, 
  getAccessTokenSilently: () => Promise<string>,
  fallbackProjectId?: string
) => {
  try {
    console.log("Préparation de la création du BCF...");

    const projectId = fallbackProjectId || (workspaceApi ? (await workspaceApi.project.getProject()).id : undefined);
    if (!projectId) return { success: false, error: "Projet Trimble Connect non identifié." };

    let models: any[] = [];
    let camera: any | null = null;
    let snapshotBase64: string | undefined;

    if (workspaceApi) {
      try {
        models = await workspaceApi.viewer.getModels("loaded");
        camera = await workspaceApi.viewer.getCamera();
        snapshotBase64 = await workspaceApi.viewer.getSnapshot();
        console.log("Camera data:", camera);
      } catch (viewerError) {
        console.warn("Création BCF sans viewpoint 3D: le Viewer n'est pas actif.", viewerError);
      }
    }

    // Calcul de la direction et du vecteur "up" de la caméra
    let dirX = 0, dirY = 0, dirZ = -1;
    let upX = 0, upY = 1, upZ = 0;

    if (camera?.lookAt && camera.position) {
      dirX = camera.lookAt.x - camera.position.x;
      dirY = camera.lookAt.y - camera.position.y;
      dirZ = camera.lookAt.z - camera.position.z;
      if (camera.upDirection) {
        upX = camera.upDirection.x;
        upY = camera.upDirection.y;
        upZ = camera.upDirection.z;
      }
    } else if (camera?.quaternion) {
      const q = camera.quaternion;
      
      // Direction = rotation de (0, 0, -1) par le quaternion
      dirX = -2 * (q.x * q.z + q.w * q.y);
      dirY = -2 * (q.y * q.z - q.w * q.x);
      dirZ = -(1 - 2 * (q.x * q.x + q.y * q.y));

      // Up = rotation de (0, 1, 0) par le quaternion
      upX = 2 * (q.x * q.y - q.w * q.z);
      upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      upZ = 2 * (q.y * q.z + q.w * q.x);
    } else if (camera?.upDirection) {
      upX = camera.upDirection.x;
      upY = camera.upDirection.y;
      upZ = camera.upDirection.z;
    }

    // Normaliser la direction
    const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (length > 0) {
      dirX /= length;
      dirY /= length;
      dirZ /= length;
    }

    const perspective_camera = camera && (camera.projectionType === "perspective" || !camera.projectionType) ? {
      camera_view_point: camera.position || { x: 0, y: 0, z: 0 },
      camera_direction: { x: dirX, y: dirY, z: dirZ },
      camera_up_vector: { x: upX, y: upY, z: upZ },
      field_of_view: camera.fieldOfView || 60
    } : undefined;

    const orthogonal_camera = camera?.projectionType === "ortho" ? {
      camera_view_point: camera.position || { x: 0, y: 0, z: 0 },
      camera_direction: { x: dirX, y: dirY, z: dirZ },
      camera_up_vector: { x: upX, y: upY, z: upZ },
      view_to_world_scale: camera.orthoSize || 1
    } : undefined;

    const token = await getAccessTokenSilently();

    const cleanTopicData = Object.fromEntries(
      Object.entries(topicData).filter(([, value]) => value !== undefined && value !== null && value !== '')
    );

    const payload: Record<string, any> = {
      ...cleanTopicData,
    };

    if (camera && snapshotBase64) {
      payload.models = models ? models.map(m => ({ id: m.id, name: m.name })) : [];
      payload.viewpoint = {
        perspective_camera: perspective_camera,
        orthogonal_camera: orthogonal_camera,
        components: {
          selection: [] // Optionnel: on pourrait lister les objets sélectionnés ici
        },
        files: models ? models.map(m => ({ file_identifier: m.id, file_name: m.name || "Model" })) : []
      };
      payload.snapshot = snapshotBase64;
    }

    console.log("Envoi au backend Vercel...");

    // 6. Envoyer au proxy backend (déjà déployé !)
    const response = await fetch(`https://trimble-agent-extension.vercel.app/api/projects/${projectId}/bcf/topics`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Project-Region': 'eu' // Par défaut 'eu', peut être rendu dynamique
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${errorText}`);
    }

    const createdBcf = await response.json();
    console.log("✅ BCF Créé avec succès:", createdBcf);
    return createdBcf;

  } catch (error: any) {
    console.error("❌ Erreur lors de la création du BCF:", error);
    return { error: error.message };
  }
};

// ============================================================
// Phase 1: BCF Avancé - Recherche, détail, suppression, commentaires, extensions
// ============================================================

export const searchBcfTopics = async (
  projectId: string,
  filters: { query?: string; status?: string; priority?: string; type?: string; assigned_to?: string; label?: string; limit?: number },
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `${PROXY_URL}/api/projects/${projectId}/bcf/topics`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    let topics: any[] = await response.json();

    if (filters.query) {
      const q = filters.query.toLowerCase();
      topics = topics.filter((t: any) =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.guid?.toLowerCase().includes(q)
      );
    }
    if (filters.status) {
      topics = topics.filter((t: any) => t.topic_status?.toLowerCase() === filters.status!.toLowerCase());
    }
    if (filters.priority) {
      topics = topics.filter((t: any) => t.priority?.toLowerCase() === filters.priority!.toLowerCase());
    }
    if (filters.type) {
      topics = topics.filter((t: any) => t.topic_type?.toLowerCase() === filters.type!.toLowerCase());
    }
    if (filters.assigned_to) {
      topics = topics.filter((t: any) => t.assigned_to?.toLowerCase().includes(filters.assigned_to!.toLowerCase()));
    }
    if (filters.label) {
      topics = topics.filter((t: any) => t.labels?.some((l: string) => l.toLowerCase().includes(filters.label!.toLowerCase())));
    }

    const limit = filters.limit || 30;
    const lightTopics = topics.map((t: any) => ({
      guid: t.guid,
      title: t.title,
      status: t.topic_status,
      priority: t.priority,
      type: t.topic_type,
      assigned_to: t.assigned_to,
      labels: t.labels,
      created: t.creation_date?.substring(0, 10),
      modified: t.modified_date?.substring(0, 10),
    }));

    const truncated = lightTopics.length > limit;
    const returnedTopics = truncated ? lightTopics.slice(0, limit) : lightTopics;

    return {
      success: true,
      total: lightTopics.length,
      showing: returnedTopics.length,
      truncated,
      topics: returnedTopics,
    };
  } catch (error: any) {
    console.error("❌ Erreur recherche BCF:", error);
    return { success: false, error: error.message };
  }
};

export const getBcfTopic = async (
  projectId: string,
  topicId: string,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `${PROXY_URL}/api/projects/${projectId}/bcf/topics/${topicId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    const topic = await response.json();
    return {
      success: true,
      topic: {
        guid: topic.guid,
        title: topic.title,
        description: topic.description,
        status: topic.topic_status,
        priority: topic.priority,
        type: topic.topic_type,
        assigned_to: topic.assigned_to,
        labels: topic.labels,
        due_date: topic.due_date,
        created: topic.creation_date?.substring(0, 10),
        modified: topic.modified_date?.substring(0, 10),
        creation_author: topic.creation_author,
        modified_author: topic.modified_author,
      },
    };
  } catch (error: any) {
    console.error("❌ Erreur get BCF:", error);
    return { success: false, error: error.message };
  }
};

export const deleteBcfTopic = async (
  projectId: string,
  topicId: string,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `${PROXY_URL}/api/projects/${projectId}/bcf/topics/${topicId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Project-Region': region,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    return { success: true, message: `BCF topic ${topicId} supprimé.` };
  } catch (error: any) {
    console.error("❌ Erreur delete BCF:", error);
    return { success: false, error: error.message };
  }
};

export const listBcfComments = async (
  projectId: string,
  topicId: string,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `${PROXY_URL}/api/projects/${projectId}/bcf/topics/${topicId}/comments`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    const comments: any[] = await response.json();
    const lightComments = comments.map((c: any) => ({
      guid: c.guid,
      comment: c.comment,
      author: c.author,
      date: c.date?.substring(0, 19),
      modified_author: c.modified_author,
      modified_date: c.modified_date?.substring(0, 19),
    }));

    return { success: true, count: lightComments.length, comments: lightComments };
  } catch (error: any) {
    console.error("❌ Erreur list BCF comments:", error);
    return { success: false, error: error.message };
  }
};

export const addBcfComment = async (
  projectId: string,
  topicId: string,
  comment: string,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `${PROXY_URL}/api/projects/${projectId}/bcf/topics/${topicId}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
        body: JSON.stringify({ comment }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    const created = await response.json();
    return {
      success: true,
      comment: {
        guid: created.guid,
        comment: created.comment,
        author: created.author,
        date: created.date?.substring(0, 19),
      },
    };
  } catch (error: any) {
    console.error("❌ Erreur add BCF comment:", error);
    return { success: false, error: error.message };
  }
};

export const getBcfExtensions = async (
  projectId: string,
  getAccessTokenSilently: () => Promise<string>,
  region: string = 'eu'
) => {
  try {
    const token = await getAccessTokenSilently();
    const response = await fetch(
      `${PROXY_URL}/api/projects/${projectId}/bcf/extensions`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Project-Region': region,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API BCF: ${response.status} - ${errorText}`);
    }

    const extensions = await response.json();
    return { success: true, extensions };
  } catch (error: any) {
    console.error("❌ Erreur get BCF extensions:", error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// Phase 3: Viewer 3D Avancé
// ============================================================

export const getCamera = async () => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const camera = await workspaceApi.viewer.getCamera();
    return { success: true, camera };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const setCameraPosition = async (cameraState: any) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).setCamera(cameraState);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const getLoadedModels = async () => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const models = await workspaceApi.viewer.getModels("loaded");
    const lightModels = models.map((m: any) => ({
      id: m.id,
      name: m.name,
      type: m.type,
    }));
    return { success: true, models: lightModels };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const toggleModelVisibility = async (modelId: string, visible: boolean) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).toggleModel(modelId, visible);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const addSectionPlane = async (plane: any) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).addSectionPlane(plane);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const removeSectionPlanes = async () => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).removeSectionPlanes();
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const getObjectPropertiesById = async (modelId: string, runtimeIds: number[]) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const properties = await workspaceApi.viewer.getObjectProperties(modelId, runtimeIds);
    return { success: true, properties };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const getLayers = async () => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const layers = await (workspaceApi.viewer as any).getLayers();
    return { success: true, layers };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const setLayersVisibility = async (layerVisibility: any) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).setLayersVisibility(layerVisibility);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const takeSnapshot = async () => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const snapshot = await workspaceApi.viewer.getSnapshot();
    return { success: true, snapshot };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const selectObjects = async (modelId: string, objectRuntimeIds: number[]) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).setSelection([{ modelId, objectRuntimeIds }]);
    return { success: true, count: objectRuntimeIds.length };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const hideObjects = async (runtimeIds: number[], modelId: string) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const selector = {
      modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }]
    };
    await workspaceApi.viewer.setObjectState(selector, { visible: false });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const showAllObjects = async () => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await workspaceApi.viewer.setObjectState(undefined, { visible: "reset" as any });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const zoomToObjects = async (modelId: string, objectRuntimeIds: number[]) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).zoomToObjects([{ modelId, objectRuntimeIds }]);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const setRenderMode = async (mode: string) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    await (workspaceApi.viewer as any).setRenderMode(mode);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
};

export const getModelTree = async (modelId: string) => {
  if (!workspaceApi) return { error: "Non connecté au Viewer 3D" };
  try {
    const tree = await (workspaceApi.viewer as any).getModelTree(modelId);
    return { success: true, tree };
  } catch (error: any) {
    return { error: error.message };
  }
};