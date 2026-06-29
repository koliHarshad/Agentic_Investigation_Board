import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  Send, 
  Search, 
  Activity, 
  BookOpen, 
  FileText, 
  AlertTriangle
} from 'lucide-react';

const NODE_COLORS = {
  person: 'rgba(59, 130, 246, 0.95)',          // Teal Blue
  organization: 'rgba(139, 92, 246, 0.95)',    // Violet Purple
  event: 'rgba(239, 68, 68, 0.95)',            // Sunset Red
  location: 'rgba(16, 185, 129, 0.95)',        // Emerald Green
  financial_instrument: 'rgba(245, 158, 11, 0.95)', // Amber Yellow
  other: 'rgba(107, 114, 128, 0.95)',          // Slate Gray
};

export default function App() {
  const [query, setQuery] = useState('');
  const [statusLogs, setStatusLogs] = useState([]);
  const [orchestratorPlan, setOrchestratorPlan] = useState('');
  const [researchQueries, setResearchQueries] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [narrative, setNarrative] = useState('');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);
  const graphRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusLogs]);

  // Adjust graph zoom/fit when data loads
  useEffect(() => {
    if (graphData.nodes.length > 0 && graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  }, [graphData.nodes.length]);

  const handleStartInvestigation = () => {
    if (!query.trim() || isInvestigating) return;

    // Reset State
    setStatusLogs([]);
    setOrchestratorPlan('');
    setResearchQueries([]);
    setGraphData({ nodes: [], links: [] });
    setNarrative('');
    setErrorMsg('');
    setIsInvestigating(true);

    // Setup WebSocket
    const ws = new WebSocket('ws://127.0.0.1:8000/ws/investigate');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ query: query }));
      setStatusLogs(prev => [...prev, 'Connected to server. Initiating investigation pipeline...']);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      switch (msg.type) {
        case 'status':
          setStatusLogs(prev => [...prev, msg.data]);
          break;
        case 'orchestrator_plan':
          setOrchestratorPlan(msg.data);
          break;
        case 'research_queries':
          setResearchQueries(msg.data);
          break;
        case 'node_added':
          setGraphData(prev => {
            if (prev.nodes.some(n => n.id === msg.data.id)) return prev;
            return {
              ...prev,
              nodes: [...prev.nodes, msg.data]
            };
          });
          setStatusLogs(prev => [...prev, `[Node Extracted] ${msg.data.name} (${msg.data.type})`]);
          break;
        case 'edge_added':
          setGraphData(prev => {
            const exists = prev.links.some(
              l => (l.source === msg.data.source && l.target === msg.data.target) ||
                   (l.source === msg.data.target && l.target === msg.data.source)
            );
            if (exists) return prev;
            return {
              ...prev,
              links: [...prev.links, msg.data]
            };
          });
          setStatusLogs(prev => [...prev, `[Relationship Found] Connected: ${msg.data.source} ↔ ${msg.data.target} (${msg.data.type})`]);
          break;
        case 'narrative':
          setNarrative(msg.data);
          break;
        case 'complete':
          setStatusLogs(prev => [...prev, 'Investigation sequence completed. Final story rendered.']);
          setIsInvestigating(false);
          ws.close();
          break;
        case 'error':
          setErrorMsg(msg.data);
          setStatusLogs(prev => [...prev, `[Error] ${msg.data}`]);
          setIsInvestigating(false);
          ws.close();
          break;
        default:
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      setErrorMsg('Failed to connect to backend server. Make sure FastAPI server is running on port 8000.');
      setIsInvestigating(false);
    };

    ws.onclose = () => {
      setIsInvestigating(false);
    };
  };

  const paintNode = useCallback((node, ctx, globalScale) => {
    const label = node.name;
    const fontSize = 11 / globalScale;
    ctx.font = `${fontSize}px 'Inter', sans-serif`;
    
    // Draw outer glow border
    const r = 6;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI, false);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = NODE_COLORS[node.type] || NODE_COLORS.other;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw text label centered below node
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(label, node.x, node.y + r + 7);
  }, []);

  return (
    <div className="app-container">
      {/* Header bar */}
      <header className="header-bar">
        <div className="logo-section">
          <div className="logo-icon-wrapper">
            <Activity className="h-6 w-6" style={{ animation: 'pulse-slow 3s infinite ease-in-out' }} />
          </div>
          <div className="title-group">
            <h1>Agentic Investigation Board</h1>
            <p>Autonomous multi-agent correlation mapping engine</p>
          </div>
        </div>
        
        <div className="header-right">
          {isInvestigating && (
            <div className="status-indicator">
              <span className="status-dot"></span>
              <span>Running round sequence...</span>
            </div>
          )}
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Capstone Submission v1.0</span>
        </div>
      </header>

      {/* Main Workspace split */}
      <div className="workspace">
        {/* Left Side: Controller, Chat Logs & Narrative */}
        <div className="left-panel">
          
          {/* Query input panel */}
          <div className="query-panel">
            <label className="panel-label">Investigate Prompt</label>
            <div className="input-container">
              <input
                type="text"
                placeholder="e.g. Investigate the collapse of Enron..."
                className="query-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartInvestigation()}
                disabled={isInvestigating}
              />
              <button
                onClick={handleStartInvestigation}
                disabled={isInvestigating || !query.trim()}
                className="send-btn"
              >
                <Send className="h-4 w-4" style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
            
            {errorMsg && (
              <div className="error-banner">
                <AlertTriangle className="h-4 w-4" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Tabbed view: Logs & Narratives */}
          <div className="list-wrapper">
            {/* Live Progress Logs */}
            <div className="logs-section">
              <div className="section-title">
                <Search className="h-4 w-4" style={{ width: '16px', height: '16px', color: '#64748b' }} />
                <h3>Investigation Logs</h3>
              </div>
              <div className="logs-box">
                {statusLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0' }}>
                    Enter a query above to start the sequential loop
                  </div>
                ) : (
                  statusLogs.map((log, idx) => (
                    <div key={idx} className="log-entry">
                      <span className="log-time">[{new Date().toLocaleTimeString()}]</span>
                      <span>{log}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Final Case Narrative Panel */}
            <div className="narrative-section">
              <div className="section-title">
                <FileText className="h-4 w-4" style={{ width: '16px', height: '16px', color: '#64748b' }} />
                <h3>Final Narrative Report</h3>
              </div>
              <div className="narrative-box">
                {narrative ? (
                  <div style={{ whitespace: 'pre-line' }}>
                    {narrative}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {isInvestigating ? 'Awaiting loop completion...' : 'Final narrative report will appear here.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: The Force Directed Evidence Board */}
        <div className="right-panel">
          {/* Subheading overlays */}
          <div className="plan-overlay">
            <div className="glass-panel overlay-card" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen className="h-4 w-4" style={{ width: '16px', height: '16px', color: '#ef4444' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f172a' }}>Active Evidence Board (Light Theme)</span>
            </div>
            
            {orchestratorPlan && (
              <div className="glass-panel overlay-card">
                <span className="overlay-label">Current Plan</span>
                <p className="overlay-content" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {orchestratorPlan}
                </p>
              </div>
            )}
            
            {researchQueries.length > 0 && (
              <div className="glass-panel overlay-card">
                <span className="overlay-label">Active Queries</span>
                <ul style={{ fontSize: '0.75rem', color: '#334155', margin: '4px 0 0 0', paddingLeft: '16px' }}>
                  {researchQueries.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Colored Node Legend overlay */}
          <div className="glass-panel legend-overlay">
            <span style={{ fontWeight: '700', color: '#475569', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legend</span>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: NODE_COLORS.person }}></span>
              <span>Person</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: NODE_COLORS.organization }}></span>
              <span>Organization</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: NODE_COLORS.event }}></span>
              <span>Event</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: NODE_COLORS.location }}></span>
              <span>Location</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: NODE_COLORS.financial_instrument }}></span>
              <span>Financial Instrument</span>
            </div>
          </div>

          {/* The canvas force-directed graph renderer */}
          <div className="graph-canvas-container">
            {graphData.nodes.length === 0 ? (
              <div className="empty-graph-state">
                No active entities on the board. Start an investigation to draw the board.
              </div>
            ) : (
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                nodeCanvasObject={paintNode}
                linkColor={() => '#ef4444'} 
                linkWidth={(link) => (link.confidence ? link.confidence * 3.5 : 2)}
                linkLabel={(link) => `${link.type} (confidence: ${(link.confidence * 100).toFixed(0)}%)`}
                d3VelocityDecay={0.3}
                cooldownTicks={100}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
