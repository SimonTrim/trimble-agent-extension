import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',      // dev local (Vite)
    'http://localhost:3000',      // dev local
    // Ajouter les origines autorisées (ex: Vercel, Github Pages)
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Region'],
}));

app.use(express.json());

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
    const { viewpoint, snapshot, ...topicData } = req.body;
    
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
        components: viewpoint.components
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
    
    res.json(createdTopic);
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
