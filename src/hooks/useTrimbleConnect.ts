import { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ── Déclaration globale du SDK chargé via CDN ──
declare global {
  interface Window {
    TrimbleConnectWorkspace: {
      connect: (
        target: Window | HTMLIFrameElement,
        onEvent: (event: string, data: unknown) => void,
        timeout?: number,
      ) => Promise<TrimbleAPI>;
    };
  }
}

export interface ViewerSelection {
  modelId: string;
  objectRuntimeIds: number[];
}

export interface TrimbleAPI {
  project: {
    getCurrentProject: () => Promise<{ id: string; name: string; location: string }>;
  };
  extension: {
    requestPermission: (permission: string) => Promise<string>;
    setStatusMessage: (msg: string) => void;
  };
  viewer: {
    getModels: (filter?: string) => Promise<unknown[]>;
    getSelection: () => Promise<ViewerSelection[]>;
    setSelection: (selector: unknown, mode: string) => Promise<void>;
    getObjectProperties: (modelId: string, ids: number[]) => Promise<unknown[]>;
    getHierarchyChildren: (modelId: string, ids: number[], type: string, recursive: boolean) => Promise<unknown[]>;
    setObjectState: (selector: unknown, state: unknown) => Promise<void>;
    isolateEntities: (entities: unknown[]) => Promise<void>;
    convertToObjectIds: (modelId: string, ids: number[]) => Promise<string[]>;
    convertToObjectRuntimeIds: (modelId: string, ids: string[]) => Promise<number[]>;
    getSnapshot: () => Promise<string>;
    getCamera: () => Promise<{ position: {x: number, y: number, z: number}, target: {x: number, y: number, z: number}, up: {x: number, y: number, z: number} }>;
    setCamera: (camera: 'reset' | any) => Promise<void>;
  };
}

export interface ConnectProject {
  id: string;
  name: string;
  location: string;
}

export interface TrimbleConnectState {
  isConnected: boolean;
  isEmbedded: boolean;
  project: ConnectProject | null;
  accessToken: string | null;
  selection: ViewerSelection[];
  api: TrimbleAPI | null;
}

const TrimbleContext = createContext<TrimbleConnectState>({
  isConnected: false,
  isEmbedded: false,
  project: null,
  accessToken: null,
  selection: [],
  api: null,
});

export const TrimbleProvider = TrimbleContext.Provider;
export function useTrimbleContext() { return useContext(TrimbleContext); }

export function useTrimbleConnect() {
  const [state, setState] = useState<TrimbleConnectState>({
    isConnected: false,
    isEmbedded: false,
    project: null,
    accessToken: null,
    selection: [],
    api: null,
  });

  const handleEvent = useCallback((event: string, data: unknown) => {
    switch (event) {
      case 'extension.accessToken':
        setState(s => ({ ...s, accessToken: data as string }));
        break;
      case 'viewer.selectionChanged':
        setState(s => ({ ...s, selection: data as ViewerSelection[] }));
        break;
    }
  }, []);

  useEffect(() => {
    const isInIframe = window.self !== window.top;

    if (isInIframe && window.TrimbleConnectWorkspace) {
      window.TrimbleConnectWorkspace
        .connect(window.parent, handleEvent, 30000)
        .then(async (api) => {
          const project = await api.project.getCurrentProject();
          const token = await api.extension.requestPermission('accesstoken');
          setState({
            isConnected: true,
            isEmbedded: true,
            project,
            accessToken: token !== 'pending' && token !== 'denied' ? token : null,
            selection: [],
            api,
          });
        })
        .catch(console.error);
    } else {
      // Dev mode: API=null -> triggers mock fallbacks
      const mockApi: TrimbleAPI = {
        project: { getCurrentProject: async () => ({ id: 'mock', name: 'Dev local', location: 'europe' }) },
        extension: { requestPermission: async () => 'mock-token', setStatusMessage: () => {} },
        viewer: {
          getModels: async () => [{id: 'model-1'}],
          getSelection: async () => [{modelId: 'model-1', objectRuntimeIds: [1, 2, 3]}],
          setSelection: async () => {},
          getObjectProperties: async () => [
            { runtimeId: 1, name: 'Wall', type: 'IfcWall', properties: [{ name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: '1h' }] }] },
            { runtimeId: 2, name: 'Door', type: 'IfcDoor', properties: [{ name: 'Pset_DoorCommon', properties: [{ name: 'FireRating', value: '' }] }] }
          ],
          getHierarchyChildren: async () => [],
          setObjectState: async () => console.log('Mock: Set object state'),
          isolateEntities: async () => console.log('Mock: Isolate entities'),
          convertToObjectIds: async () => ['guid1', 'guid2'],
          convertToObjectRuntimeIds: async () => [1, 2],
          getSnapshot: async () => 'data:image/png;base64,mockbase64data',
          getCamera: async () => ({ position: {x:0, y:0, z:0}, target: {x:1, y:1, z:1}, up: {x:0, y:0, z:1} }),
          setCamera: async () => console.log('Mock: Set camera reset')
        }
      };

      setState({
        isConnected: true,
        isEmbedded: false,
        project: { id: 'mock-proj', name: 'Dev local', location: 'europe' },
        accessToken: 'mock-token',
        selection: [],
        api: mockApi,
      });
    }
  }, [handleEvent]);

  return state;
}
