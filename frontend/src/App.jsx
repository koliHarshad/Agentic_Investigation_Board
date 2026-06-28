import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  Send, 
  Search, 
  Activity, 
  BookOpen, 
  FileText, 
  AlertTriangle,
  Play,
  RotateCcw,
  PlusCircle,
  HelpCircle
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
      // Send the query
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
            // Avoid duplicate rendering
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
            // Avoid duplicate links
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

  // Customized premium lighter Node canvas drawings
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
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillText(label, node.x, node.y + r + 7);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f8fafc] text-[#1e293b] font-sans overflow-hidden">
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#e2e8f0] shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-[#fee2e2] text-[#ef4444] rounded-lg">
            <Activity className="h-6 w-6 animate-pulse-slow" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0f172a] m-0">Agentic Investigation Board</h1>
            <p className="text-xs text-[#64748b] m-0">Autonomous multi-agent correlation mapping engine</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {isInvestigating && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
              <span className="h-2 w-2 bg-blue-500 rounded-full animate-ping"></span>
              <span>Running round sequence...</span>
            </div>
          )}
          <span className="text-xs text-[#94a3b8]">Capstone Submission v1.0</span>
        </div>
      </header>

      {/* Main Workspace split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Controller, Chat Logs & Narrative */}
        <div className="w-1/3 flex flex-col border-r border-[#e2e8f0] bg-white overflow-hidden">
          
          {/* Query input panel */}
          <div className="p-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <label className="block text-xs font-bold text-[#475569] uppercase tracking-wider mb-2">Investigate Prompt</label>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="e.g. Investigate the collapse of Enron..."
                className="w-full pl-3 pr-10 py-2.5 bg-white border border-[#cbd5e1] rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm shadow-sm transition-all"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartInvestigation()}
                disabled={isInvestigating}
              />
              <button
                onClick={handleStartInvestigation}
                disabled={isInvestigating || !query.trim()}
                className="absolute right-1.5 p-1.5 bg-[#ef4444] hover:bg-[#dc2626] text-white disabled:bg-[#cbd5e1] rounded-lg transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            
            {errorMsg && (
              <div className="mt-3 flex items-start space-x-2 p-2.5 bg-[#fef2f2] text-[#b91c1c] text-xs rounded-lg border border-[#fecaca]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Tabbed view: Logs & Narratives */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Live Progress Logs */}
            <div className="flex-1 flex flex-col p-4 border-b border-[#e2e8f0] overflow-hidden">
              <div className="flex items-center space-x-2 mb-2">
                <Search className="h-4 w-4 text-[#64748b]" />
                <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider m-0">Investigation Logs</h3>
              </div>
              <div className="flex-1 bg-[#fafafa] border border-[#e2e8f0] rounded-xl p-3 overflow-y-auto text-xs font-mono text-[#334155] space-y-2">
                {statusLogs.length === 0 ? (
                  <div className="text-center text-[#94a3b8] py-8">
                    Enter a query above to start the sequential loop
                  </div>
                ) : (
                  statusLogs.map((log, idx) => (
                    <div key={idx} className="border-b border-[#f1f5f9] pb-1">
                      <span className="text-[#94a3b8] mr-2">[{new Date().toLocaleTimeString()}]</span>
                      <span>{log}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Final Case Narrative Panel */}
            <div className="h-2/5 flex flex-col p-4 overflow-hidden">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="h-4 w-4 text-[#64748b]" />
                <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider m-0">Final Narrative Report</h3>
              </div>
              <div className="flex-1 bg-[#fefefe] border border-[#e2e8f0] rounded-xl p-3 overflow-y-auto text-sm text-[#334155] leading-relaxed">
                {narrative ? (
                  <div className="markdown-body whitespace-pre-line">
                    {narrative}
                  </div>
                ) : (
                  <div className="text-center text-[#94a3b8] py-8 text-xs font-mono">
                    {isInvestigating ? 'Awaiting loop completion...' : 'Final narrative report will appear here.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: The Force Directed Evidence Board */}
        <div className="flex-1 flex flex-col bg-white relative">
          {/* Subheading overlays */}
          <div className="absolute top-4 left-4 z-10 flex flex-col space-y-2 pointer-events-none">
            <div className="glass-panel px-4 py-2 flex items-center space-x-2 pointer-events-auto">
              <BookOpen className="h-4 w-4 text-[#ef4444]" />
              <span className="text-xs font-bold text-[#0f172a]">Active Evidence Board (Light Theme)</span>
            </div>
            
            {orchestratorPlan && (
              <div className="glass-panel p-3 max-w-sm pointer-events-auto shadow-sm">
                <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Current Plan</span>
                <p className="text-xs text-[#334155] mt-1 line-clamp-3 leading-normal">{orchestratorPlan}</p>
              </div>
            )}
            
            {researchQueries.length > 0 && (
              <div className="glass-panel p-3 pointer-events-auto">
                <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Active Queries</span>
                <ul className="text-xs text-[#334155] mt-1 pl-4 list-disc space-y-0.5">
                  {researchQueries.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Colored Node Legend overlay (bottom left) */}
          <div className="absolute bottom-4 left-4 z-10 glass-panel p-3 flex flex-col space-y-1.5 shadow-sm text-xs select-none">
            <span className="font-bold text-[#475569] uppercase text-[10px] tracking-wider mb-0.5">Legend</span>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.person }}></span>
              <span>Person</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.organization }}></span>
              <span>Organization</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.event }}></span>
              <span>Event</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.location }}></span>
              <span>Location</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS.financial_instrument }}></span>
              <span>Financial Instrument</span>
            </div>
          </div>

          {/* The canvas force-directed graph renderer */}
          <div className="flex-1 h-full w-full">
            {graphData.nodes.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center bg-[#f8fafc] text-[#94a3b8] text-sm">
                No active entities on the board. Start an investigation to draw the board.
              </div>
            ) : (
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                nodeCanvasObject={paintNode}
                // Red-string drawing
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
