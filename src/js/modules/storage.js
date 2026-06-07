import { EventBus, showToast } from './utils.js';

class StorageManager {
  constructor() {
    this.db = null;
    this.dbName = 'VideoEditorDB';
    this.dbVersion = 1;
    this.saveBtn = document.getElementById('btn-save');
    
    this.init();
  }

  async init() {
    await this.initIndexedDB();
    this.setupEventListeners();
    this.autoLoadProject();
  }

  setupEventListeners() {
    this.saveBtn.addEventListener('click', () => this.saveProject());
    
    EventBus.on('clip:added', () => this.autoSave());
    EventBus.on('clip:deleted', () => this.autoSave());
    EventBus.on('clip:updated', () => this.autoSave());

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveProject();
      }
    });
  }

  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('IndexedDB open failed');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('materials')) {
          const materialStore = db.createObjectStore('materials', { keyPath: 'id' });
          materialStore.createIndex('projectId', 'projectId', { unique: false });
        }
      };
    });
  }

  async saveProject() {
    try {
      const projectData = this.serializeProject();
      
      localStorage.setItem('videoEditor:lastProject', JSON.stringify({
        id: projectData.id,
        name: projectData.name,
        updatedAt: projectData.updatedAt
      }));

      await this.saveToIndexedDB(projectData);
      
      showToast('项目已保存', 'success');
      EventBus.emit('project:saved', projectData);
    } catch (error) {
      console.error('Save failed:', error);
      showToast('保存失败: ' + error.message, 'error');
    }
  }

  autoSave() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    this.autoSaveTimeout = setTimeout(() => {
      this.saveProject();
    }, 3000);
  }

  async autoLoadProject() {
    try {
      const lastProject = localStorage.getItem('videoEditor:lastProject');
      if (lastProject) {
        const { id } = JSON.parse(lastProject);
        const project = await this.loadFromIndexedDB(id);
        if (project) {
          this.deserializeProject(project);
          console.log('Project auto-loaded');
        }
      }
    } catch (error) {
      console.warn('Auto-load failed:', error);
    }
  }

  serializeProject() {
    const materials = window.__materialManager?.getAllMaterials() || [];
    const clips = window.__timelineManager?.getClips() || [];

    const serializedClips = clips.map(clip => ({
      ...clip,
      materialId: clip.materialId,
      material: undefined,
      file: undefined,
      url: undefined,
      thumbnail: undefined
    }));

    const serializedMaterials = materials.map(mat => ({
      id: mat.id,
      name: mat.name,
      type: mat.type,
      size: mat.size,
      duration: mat.duration,
      width: mat.width,
      height: mat.height,
      thumbnail: mat.thumbnail,
      createdAt: mat.createdAt
    }));

    return {
      id: localStorage.getItem('videoEditor:projectId') || 'project_' + Date.now(),
      name: '未命名项目',
      clips: serializedClips,
      materials: serializedMaterials,
      totalDuration: window.__timelineManager?.getTotalDuration() || 0,
      createdAt: parseInt(localStorage.getItem('videoEditor:createdAt')) || Date.now(),
      updatedAt: Date.now()
    };
  }

  async deserializeProject(project) {
    localStorage.setItem('videoEditor:projectId', project.id);
    localStorage.setItem('videoEditor:createdAt', project.createdAt.toString());

    EventBus.emit('project:loading', project);
    showToast('正在加载项目...', 'info');
  }

  async saveToIndexedDB(project) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['projects'], 'readwrite');
      const store = transaction.objectStore('projects');
      const request = store.put(project);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async loadFromIndexedDB(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllProjects() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const index = store.index('updatedAt');
      const request = index.openCursor(null, 'prev');

      const projects = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          projects.push(cursor.value);
          cursor.continue();
        } else {
          resolve(projects);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteProject(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['projects'], 'readwrite');
      const store = transaction.objectStore('projects');
      const request = store.delete(id);

      request.onsuccess = () => {
        const lastProject = localStorage.getItem('videoEditor:lastProject');
        if (lastProject) {
          const data = JSON.parse(lastProject);
          if (data.id === id) {
            localStorage.removeItem('videoEditor:lastProject');
          }
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  clearLocalCache() {
    localStorage.removeItem('videoEditor:lastProject');
    localStorage.removeItem('videoEditor:projectId');
    localStorage.removeItem('videoEditor:createdAt');
  }

  async exportProjectFile() {
    const projectData = this.serializeProject();
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectData.name || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importProjectFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const project = JSON.parse(e.target.result);
          await this.saveToIndexedDB(project);
          this.deserializeProject(project);
          resolve(project);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
}

export const storageManager = new StorageManager();
