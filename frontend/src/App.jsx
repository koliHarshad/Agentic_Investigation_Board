import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  Send, 
  Search, 
  Activity, 
  BookOpen, 
  FileText, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Compass,
  Link2,
  Book,
  ChevronRight
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
  const [activeQuery, setActiveQuery] = useState('');
  const [statusLogs, setStatusLogs] = useState([]);
  const [orchestratorPlan, setOrchestratorPlan] = useState('');
  const [researchQueries, setResearchQueries] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [narrative, setNarrative] = useState('');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // UX State
  const [isPlanCollapsed, setIsPlanCollapsed] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [hasNewSummary, setHasNewSummary] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  // Evidence Docs State
  const [documents, setDocuments] = useState([]);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState(null);

  const wsRef = useRef(null);
  const logsEndRef = useRef(null);
  const graphRef = useRef(null);
  const containerRef = useRef(null);

  // ResizeObserver to dynamically track dimensions of right panel
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll chat logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusLogs]);

  // Set new summary notification dot when narrative arrives
  useEffect(() => {
    if (narrative) {
      setHasNewSummary(true);
    }
  }, [narrative]);

  // Smooth fit-to-canvas once at the end of the investigation
  const handleCenterGraph = () => {
    if (graphRef.current && graphData.nodes.length > 0) {
      graphRef.current.zoomToFit(600, 80);
    }
  };

  // Compute unconnected clue nodes dynamically
  const unconnectedClues = useMemo(() => {
    const connectedNodeIds = new Set();
    graphData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
    });
    return graphData.nodes.filter(node => !connectedNodeIds.has(node.id));
  }, [graphData]);

  // Clean graph data excluding unconnected nodes for D3 simulation
  const visibleGraphData = useMemo(() => {
    const connectedNodeIds = new Set();
    graphData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
    });
    return {
      nodes: graphData.nodes.filter(node => connectedNodeIds.has(node.id)),
      links: graphData.links
    };
  }, [graphData]);

  const handleStartInvestigation = () => {
    if (!query.trim() || isInvestigating) return;

    // Reset State
    setActiveQuery(query);
    setStatusLogs([]);
    setOrchestratorPlan('');
    setResearchQueries([]);
    setGraphData({ nodes: [], links: [] });
    setNarrative('');
    setErrorMsg('');
    setHasNewSummary(false);
    setIsSummaryOpen(false);
    setDocuments([]);
    setIsDocsOpen(false);
    setExpandedDocId(null);
    setIsInvestigating(true);

    const ws = new WebSocket('ws://127.0.0.1:8000/ws/investigate');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ query: query }));
      setStatusLogs(prev => [...prev, 'Connected to correlation engine. Initiating multi-agent pipeline...']);
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
        case 'documents_added':
          setDocuments(prev => {
            const newDocs = msg.data.filter(d => !prev.some(p => p.id === d.id));
            return [...prev, ...newDocs];
          });
          break;
        case 'node_added':
          setGraphData(prev => {
            if (prev.nodes.some(n => n.id === msg.data.id)) return prev;
            return {
              ...prev,
              nodes: [...prev.nodes, msg.data]
            };
          });
          setStatusLogs(prev => [...prev, `[Clue Extracted] Found node: ${msg.data.name} (${msg.data.type})`]);
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
          setStatusLogs(prev => [...prev, `[Connection Judged] Added relationship: ${msg.data.source} ↔ ${msg.data.target} (${msg.data.type})`]);
          break;
        case 'narrative':
          setNarrative(msg.data);
          break;
        case 'complete':
          setStatusLogs(prev => [...prev, 'Investigation sequence completed. Final story rendered.']);
          setIsInvestigating(false);
          // Wait for D3 simulation to settle
          setTimeout(() => {
            if (graphRef.current) {
              graphRef.current.zoomToFit(600, 80);
            }
          }, 800);
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
    const r = 7;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 2.5, 0, 2 * Math.PI, false);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
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
    ctx.fillText(label, node.x, node.y + r + 8);
  }, []);

  // --- Inline Markdown Parser Helper ---
  const parseInline = (text) => {
    if (!text) return '';
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#0f172a', fontWeight: '700' }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let trimmed = line.trim();
      if (!trimmed) return <div key={idx} style={{ height: '8px' }}></div>;
      
      if (trimmed.startsWith('####')) {
        return <h4 key={idx} className="md-h4">{parseInline(trimmed.replace(/^####\s*/, ''))}</h4>;
      }
      if (trimmed.startsWith('###')) {
        return <h3 key={idx} className="md-h3">{parseInline(trimmed.replace(/^###\s*/, ''))}</h3>;
      }
      if (trimmed.startsWith('##')) {
        return <h2 key={idx} className="md-h2">{parseInline(trimmed.replace(/^##\s*/, ''))}</h2>;
      }
      if (trimmed.startsWith('#')) {
        return <h1 key={idx} className="md-h1">{parseInline(trimmed.replace(/^#\s*/, ''))}</h1>;
      }
      
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        return (
          <li key={idx} className="md-li">
            {parseInline(trimmed.replace(/^[-*]\s*/, ''))}
          </li>
        );
      }
      
      const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
      if (numMatch) {
        return (
          <div key={idx} className="md-num-li">
            <strong style={{ marginRight: '6px' }}>{numMatch[1]}.</strong>
            <span>{parseInline(numMatch[2])}</span>
          </div>
        );
      }
      
      return (
        <p key={idx} className="md-p">
          {parseInline(line)}
        </p>
      );
    });
  };

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
              <span>Correlating data...</span>
            </div>
          )}
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>Capstone Submission v1.2</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="workspace">
        
        {/* Unified Chat/Search and Progress Log Left Panel */}
        <div className="left-panel">
          <div className="panel-header">
            <Search className="h-4 w-4" style={{ width: '16px', height: '16px', color: '#ef4444' }} />
            <h2>Correlation Command & Logs</h2>
          </div>

          {/* Combined Scrollable Chat Interface */}
          <div className="chat-log-box">
            {statusLogs.length === 0 && !activeQuery ? (
              <div className="empty-chat-state">
                <Search className="empty-icon" />
                <p>Awaiting investigation query...</p>
                <span>Input a scenario at the bottom to trigger the autonomous mapping sequence.</span>
              </div>
            ) : (
              <div className="chat-flow-container">
                {/* User Prompt Message Bubble */}
                {activeQuery && (
                  <div className="chat-bubble user-bubble">
                    <div className="bubble-label">Scenario Query</div>
                    <div className="bubble-text">{activeQuery}</div>
                  </div>
                )}

                {/* Status Log Bubbles */}
                {statusLogs.map((log, idx) => {
                  let isNode = log.includes('[Clue Extracted]');
                  let isConnection = log.includes('[Connection Judged]');
                  let isError = log.includes('[Error]');
                  let bubbleClass = "chat-bubble status-bubble";
                  if (isNode) bubbleClass += " node-bubble";
                  if (isConnection) bubbleClass += " connection-bubble";
                  if (isError) bubbleClass += " error-bubble";

                  return (
                    <div key={idx} className={bubbleClass}>
                      <span className="log-time">{new Date().toLocaleTimeString()}</span>
                      <span className="log-text">{log}</span>
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>

          {/* Query Input fixed at the bottom of left panel */}
          <div className="query-panel">
            <div className="input-container">
              <input
                type="text"
                placeholder="Ask to investigate a scenario..."
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
        </div>

        {/* Right Side: The Force Directed Evidence Board */}
        <div className="right-panel">
          
          {/* Top-Left Collapsible Plan Panel */}
          <div className="plan-overlay">
            <div className="glass-panel overlay-card toggle-card" onClick={() => setIsPlanCollapsed(!isPlanCollapsed)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen className="h-4 w-4" style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f172a' }}>
                    Active Plan & Context
                  </span>
                </div>
                {isPlanCollapsed ? <ChevronDown className="h-4 w-4 collapsed-arrow" /> : <ChevronUp className="h-4 w-4 collapsed-arrow" />}
              </div>
              
              {!isPlanCollapsed && (
                <div className="collapsible-plan-content">
                  {orchestratorPlan ? (
                    <div style={{ marginTop: '10px' }}>
                      <span className="overlay-label">Current Plan</span>
                      <div className="plan-markdown-body">
                        {renderMarkdown(orchestratorPlan)}
                      </div>
                    </div>
                  ) : (
                    <p className="overlay-content" style={{ marginTop: '8px', color: '#94a3b8', fontStyle: 'italic' }}>
                      Awaiting query execution...
                    </p>
                  )}
                  
                  {researchQueries.length > 0 && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                      <span className="overlay-label">Active Research Queries</span>
                      <ul style={{ fontSize: '0.72rem', color: '#334155', margin: '4px 0 0 0', paddingLeft: '16px' }}>
                        {researchQueries.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Floating Actions overlay (Top-Right Action Buttons) */}
          <div className="floating-actions-overlay">
            <button className="floating-action-btn" onClick={handleCenterGraph} title="Center Graph">
              <Compass className="h-5 w-5" />
            </button>

            {/* Evidence Documents button */}
            <button 
              className={`floating-action-btn docs-trigger-btn ${documents.length > 0 ? 'pulse-green' : ''}`}
              onClick={() => {
                setIsDocsOpen(true);
                setIsSummaryOpen(false);
              }}
              title="View Evidence Documents"
            >
              <Book className="h-5 w-5" />
              {documents.length > 0 && <span className="doc-count-badge">{documents.length}</span>}
            </button>

            {/* Case Summary Report button */}
            <button 
              className={`floating-action-btn summary-trigger-btn ${hasNewSummary ? 'pulse-border' : ''}`} 
              onClick={() => {
                setIsSummaryOpen(true);
                setIsDocsOpen(false);
                setHasNewSummary(false);
              }}
              title="View Case Narrative"
            >
              <FileText className="h-5 w-5" />
              {hasNewSummary && <span className="notification-dot"></span>}
            </button>
          </div>

          {/* Slide-over Full-Height Summary Panel / Drawer */}
          {isSummaryOpen && (
            <div className="narrative-drawer">
              <div className="drawer-header">
                <div className="drawer-title">
                  <FileText className="h-5 w-5" style={{ color: '#ef4444' }} />
                  <h2>Case Narrative Report</h2>
                </div>
                <button className="close-drawer-btn" onClick={() => setIsSummaryOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="drawer-body">
                {narrative ? (
                  <div className="narrative-markdown">
                    {renderMarkdown(narrative)}
                  </div>
                ) : (
                  <div className="empty-drawer-state">
                    <AlertTriangle className="h-10 w-10 text-slate-300" style={{ marginBottom: '12px' }} />
                    <p>No narrative report drafted yet.</p>
                    <span>The Case Narrative will automatically compile and notify you once the multi-agent correlation cycle completes.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Slide-over Full-Height Evidence Documents Drawer */}
          {isDocsOpen && (
            <div className="narrative-drawer">
              <div className="drawer-header">
                <div className="drawer-title">
                  <Book className="h-5 w-5" style={{ color: '#10b981' }} />
                  <h2>Evidence Documents ({documents.length})</h2>
                </div>
                <button className="close-drawer-btn" onClick={() => setIsDocsOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="drawer-body">
                {documents.length === 0 ? (
                  <div className="empty-drawer-state">
                    <Book className="h-10 w-10 text-slate-300" style={{ marginBottom: '12px' }} />
                    <p>No evidence documents retrieved yet.</p>
                    <span>As search queries are executed in each round, Tavily source materials will accumulate and persist here.</span>
                  </div>
                ) : (
                  <div className="docs-flow-container">
                    {documents.map((doc) => {
                      const isExpanded = expandedDocId === doc.id;
                      return (
                        <div key={doc.id} className="doc-card">
                          <div className="doc-card-header" onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                            <div className="doc-card-title-group">
                              <span className="doc-id-badge">{doc.id.toUpperCase()}</span>
                              <h4 className="doc-title">{doc.title}</h4>
                            </div>
                            <ChevronRight className={`expand-arrow ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                          
                          {isExpanded && (
                            <div className="doc-card-content">
                              {doc.url && (
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="doc-link">
                                  <Link2 className="h-3 w-3" />
                                  <span>View Original Source</span>
                                </a>
                              )}
                              <p className="doc-text">{doc.content}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Floating Unconnected Clues overlay (Right middle panel) */}
          {unconnectedClues.length > 0 && (
            <div className="glass-panel clues-overlay">
              <span className="clues-header">Unconnected Clues</span>
              <div className="clues-list">
                {unconnectedClues.map((node) => (
                  <div 
                    key={node.id} 
                    className="clue-tag"
                    style={{ borderLeft: `3px solid ${NODE_COLORS[node.type] || NODE_COLORS.other}` }}
                    title={`Source: ${node.source_document_id}\nSnippet: "${node.source_snippet}"`}
                  >
                    <span className="clue-tag-name">{node.name}</span>
                    <span className="clue-tag-type">{node.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
          <div className="graph-canvas-container" ref={containerRef}>
            {visibleGraphData.nodes.length === 0 ? (
              <div className="empty-graph-state">
                No active correlations on the board. Start an investigation to draw the board.
              </div>
            ) : (
              <ForceGraph2D
                ref={graphRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={visibleGraphData}
                nodeCanvasObject={paintNode}
                linkColor={() => '#ef4444'} 
                linkWidth={(link) => (link.confidence ? link.confidence * 3.5 : 2)}
                nodeLabel={(node) => `
                  <div class="graph-tooltip">
                    <div class="tooltip-title">${node.name}</div>
                    <div class="tooltip-type">${node.type.toUpperCase()}</div>
                    
                    <div class="tooltip-description">${node.description || 'No description available'}</div>
                    
                    ${node.attributes && Object.keys(node.attributes).length > 0 
                      ? `<div class="tooltip-attrs">
                          ${Object.entries(node.attributes)
                            .map(([key, val]) => `<div><strong>${key}:</strong> ${val}</div>`)
                            .join('')}
                         </div>`
                      : ''
                    }
                    <div class="tooltip-snippet">
                      <strong>Source Text:</strong> "${node.source_snippet}"
                      <br/><span class="tooltip-doc">Document ID: ${node.source_document_id}</span>
                    </div>
                  </div>
                `}
                linkLabel={(link) => `
                  <div class="graph-tooltip">
                    <div class="tooltip-title">Correlated Relationship</div>
                    <div class="tooltip-text">
                      <strong>${link.source.name || link.source}</strong> 
                      <span class="rel-badge">${link.type}</span> 
                      <strong>${link.target.name || link.target}</strong>
                    </div>
                    <div class="tooltip-snippet">
                      <strong>Confidence:</strong> ${(link.confidence * 100).toFixed(0)}%
                      <br/><strong>Reasoning:</strong> "${link.reasoning}"
                    </div>
                  </div>
                `}
                d3VelocityDecay={0.25}
                cooldownTicks={100}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
