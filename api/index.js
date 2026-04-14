import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',      // dev local (Vite)
    'http://localhost:5176',      // dev local (Vite - nouveau port)
    'http://localhost:3000',      // dev local
    'https://trimble-agent-extension.vercel.app', // Vercel
    'https://trimble-agent-extension-fdxeh4iox-simon-martin-9107s-projects.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Region'],
}));

app.use(express.json({ limit: '10mb' })); // Augmentation de la limite pour les images base64

// Middleware d'authentification
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  req.accessToken = token;
  req.region = req.headers['x-project-region'] || 'eu';
  next();
}

function getBcfApiUrl(region) {
  const map = {
    'us': 'open11.connect.trimble.com',
    'eu': 'open21.connect.trimble.com',
    'ap': 'open31.connect.trimble.com',
    'ap-au': 'open32.connect.trimble.com'
  };
  const host = map[region] || map['eu'];
  return `https://${host}`;
}

// ============================================================
// Generic TC Core API proxy — avoids CORS issues from browser
// ============================================================
function getTcApiUrl(region) {
  const map = {
    'us': 'app11.connect.trimble.com',
    'eu': 'app21.connect.trimble.com',
    'ap': 'app31.connect.trimble.com',
    'ap-au': 'app32.connect.trimble.com'
  };
  const host = map[region] || map['eu'];
  return `https://${host}/tc/api/2.0`;
}

app.all('/api/tc/*', requireAuth, async (req, res) => {
  try {
    const tcPath = req.params[0];
    const baseUrl = getTcApiUrl(req.region);
    const targetUrl = new URL(`${baseUrl}/${tcPath}`);

    for (const [key, value] of Object.entries(req.query)) {
      targetUrl.searchParams.set(key, String(value));
    }

    const fetchOptions = {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    res.status(response.status);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.json(data);
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error) {
    console.error('TC Core API proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// BCF API proxy routes
// ============================================================

// Route proxy pour lister les BCF topics
app.get('/api/projects/:projectId/bcf/topics', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour modifier un BCF existant
app.put('/api/projects/:projectId/bcf/topics/:topicId', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${req.params.topicId}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour créer un BCF (avec création optionnelle de viewpoint)
app.post('/api/projects/:projectId/bcf/topics', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const topicUrl = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics`;
    
    // 1. Création du Topic
    const { viewpoint, snapshot, models, ...topicData } = req.body;
    
    const topicResponse = await fetch(topicUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(topicData)
    });
    
    if (!topicResponse.ok) throw new Error(`Topic API Error: ${await topicResponse.text()}`);
    const createdTopic = await topicResponse.json();

    // 2. S'il y a un snapshot/viewpoint, on crée le point de vue attaché au topic
    if (viewpoint && snapshot) {
      const viewpointUrl = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${createdTopic.guid}/viewpoints`;
      
      const vpData = {
        snapshot: { snapshot_type: "png", snapshot_data: snapshot.split(',')[1] }, // Remove data:image/png;base64,
        perspective_camera: viewpoint.perspective_camera,
        orthogonal_camera: viewpoint.orthogonal_camera,
        components: viewpoint.components,
        files: viewpoint.files
      };

      await fetch(viewpointUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${req.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(vpData)
      });
    }

    // 3. Lier les modèles 3D au BCF via document_references
    if (models && models.length > 0) {
      const docRefUrl = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${createdTopic.guid}/document_references`;
      
      // On exécute les requêtes en parallèle pour aller plus vite
      const docRefPromises = models.map(model => 
        fetch(docRefUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${req.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            document_guid: model.id,
            description: model.name || "Modèle 3D"
          })
        })
      );
      
      await Promise.all(docRefPromises);
    }
    
    res.json(createdTopic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour récupérer un BCF topic par ID
app.get('/api/projects/:projectId/bcf/topics/:topicId', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${req.params.topicId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour supprimer un BCF topic
app.delete('/api/projects/:projectId/bcf/topics/:topicId', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${req.params.topicId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${req.accessToken}` }
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour lister les commentaires d'un BCF topic
app.get('/api/projects/:projectId/bcf/topics/:topicId/comments', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${req.params.topicId}/comments`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour ajouter un commentaire à un BCF topic
app.post('/api/projects/:projectId/bcf/topics/:topicId/comments', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/topics/${req.params.topicId}/comments`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route proxy pour récupérer les extensions BCF (statuts, priorités, types valides)
app.get('/api/projects/:projectId/bcf/extensions', requireAuth, async (req, res) => {
  try {
    const baseUrl = getBcfApiUrl(req.region);
    const url = `${baseUrl}/bcf/2.1/projects/${req.params.projectId}/extensions`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// En mode ES module, on vérifie si c'est le module principal comme ceci:
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Backend proxy running on port ${PORT}`);
  });
}

export default app;
