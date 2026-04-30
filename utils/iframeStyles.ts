export const iframeEditorStyles = `
  html, body { overflow-x: hidden !important; margin: 0; min-height: 100vh; box-sizing: border-box; }
  ::selection { background: rgba(99, 102, 241, 0.2); }
  .main-card { max-width: 820px !important; margin: 0 auto !important; box-sizing: border-box !important; }
  .editable-block { position: relative; }
  .editable-block:hover { outline: 2px solid #6366f1 !important; cursor: pointer; outline-offset: -2px; }
  .editable-block.selected {
    outline: 2px solid #6366f1 !important;
    outline-offset: -2px;
    position: relative;
    z-index: 10;
    box-shadow: 0 0 40px rgba(99, 102, 241, 0.35);
    transition: outline-color 0.3s;
  }
  .editable-block.selected::before {
    content: "";
    position: absolute;
    top: -6px; left: -6px; right: -6px; bottom: -6px;
    border: 1px solid rgba(99, 102, 241, 0.3);
    pointer-events: none;
    z-index: 11;
  }
  .visor-drag-handle {
    position: absolute;
    right: -10px;
    top: 50%;
    transform: translateY(-50%);
    width: 30px;
    height: 46px;
    background: #6366f1;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px 0 0 10px;
    cursor: grab;
    z-index: 2000;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.5);
    transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
    opacity: 0;
    visibility: hidden;
  }
  .editable-block:only-of-type .visor-drag-handle { display: none !important; }
  .editable-block:hover > .visor-drag-handle { opacity: 1 !important; visibility: visible !important; }
  .visor-drag-handle:hover {
    transform: translateY(-50%) scale(1.1);
    background: #4f46e5;
    box-shadow: 0 6px 25px rgba(99, 102, 241, 0.6);
  }
  .visor-drag-handle:active { cursor: grabbing; cursor: -webkit-grabbing; }
  .visor-drag-handle svg { width: 16px; height: 16px; }
  .preview-active .visor-drag-handle { display: none !important; }
  .preview-active .editable-block.selected { outline: none !important; }
  .drag-over-top { border-top: 4px solid #6366f1 !important; }
  .drag-over-bottom { border-bottom: 4px solid #6366f1 !important; }
  ::-webkit-scrollbar { width: 2px; height: 2px; }
  ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.05); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: #6366f1; }
  ::-webkit-scrollbar-track { background: transparent; }
  @keyframes moduleReveal {
    0% { opacity: 0; transform: scale(0.92) translateY(30px); filter: blur(10px); }
    60% { opacity: 1; transform: scale(1.02) translateY(-5px); filter: blur(0); }
    100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
  }
  .module-drop-reveal { animation: moduleReveal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .drop-placeholder {
    height: 50px;
    background: rgba(99, 102, 241, 0.04);
    border: 1px dashed rgba(99, 102, 241, 0.3);
    border-radius: 8px;
    margin: 4px 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    animation: dropZoneGlow 2s ease-in-out infinite;
  }
  @keyframes dropZoneGlow {
    0%, 100% { 
      background: rgba(99, 102, 241, 0.04); 
      border-color: rgba(99, 102, 241, 0.3); 
      box-shadow: 0 0 0px rgba(99, 102, 241, 0);
    }
    50% { 
      background: rgba(99, 102, 241, 0.08); 
      border-color: rgba(99, 102, 241, 0.6); 
      box-shadow: 0 0 25px rgba(99, 102, 241, 0.2);
    }
  }
  .drop-icon {
    color: #6366f1;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    animation: dropBounce 1.5s ease-in-out infinite;
    opacity: 0.8;
  }
  @keyframes dropBounce {
    0%, 100% { transform: translateY(-3px); opacity: 0.6; }
    50% { transform: translateY(3px); opacity: 1; }
  }
  .drop-icon svg { width: 22px; height: 22px; }
  .editable-block.dragging { opacity: 0.4; transform: scale(0.96); pointer-events: none; }
  @keyframes textFocus {
    0% { background: rgba(99, 102, 241, 0); transform: scale(0.99); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
    70% { background: rgba(99, 102, 241, 0.12); transform: scale(1.01); box-shadow: 0 0 25px rgba(99, 102, 241, 0.2); }
    100% { background: rgba(99, 102, 241, 0.06); transform: scale(1); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
  }
  [contenteditable="true"]:hover {
    cursor: text !important;
  }
  [contenteditable="true"]:focus {
    outline: none;
    background: rgba(99, 102, 241, 0.06);
    border-radius: 8px;
    animation: textFocus 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards;
    position: relative;
    z-index: 50;
  }
  img { max-width: 100% !important; height: auto; cursor: pointer !important; }
  #floating-toolbar {
    position: fixed;
    display: none;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 10000;
    flex-direction: row;
    gap: 4px;
    backdrop-filter: blur(10px);
  }
  #floating-toolbar button {
    background: transparent;
    border: none;
    color: #94a3b8;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  #floating-toolbar button:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
  #floating-toolbar button.active { color: #6366f1; background: rgba(99, 102, 241, 0.15); }
  @keyframes sub-pulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.08); }
    100% { transform: scale(1); }
  }
  .sub-selected-active { animation: sub-pulse 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 10; }
  .sub-selected-focus { outline: 2px solid #6366f1 !important; outline-offset: 4px; z-index: 10; }
  @keyframes moduleRemove {
    0% { opacity: 1; transform: scale(1); filter: blur(0); }
    100% { opacity: 0; transform: scale(0.95) translateY(30px); filter: blur(12px); }
  }
  .module-remove-reveal { animation: moduleRemove 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards; pointer-events: none; }
  
  /* Dark Mode Simulation (Email-like) */
  body { transition: filter 0.5s ease, background-color 0.5s ease; }
  .dark-mode-simulation {
    filter: invert(100%) hue-rotate(180deg) !important;
  }
  .dark-mode-simulation img,
  .dark-mode-simulation [data-toggle="button"],
  .dark-mode-simulation .visor-drag-handle,
  .dark-mode-simulation #floating-toolbar,
  .dark-mode-simulation .drop-placeholder,
  .dark-mode-simulation .drop-icon {
    filter: invert(100%) hue-rotate(180deg) !important;
  }
  /* Preserve contrast for links, but NOT for buttons which we want to keep original */
  .dark-mode-simulation a:not([data-toggle="button"]) { color: #8ab4f8 !important; }

  @keyframes aiGlow {
    0% { box-shadow: 0 0 0px rgba(168, 85, 247, 0); background: rgba(168, 85, 247, 0); transform: scale(1); }
    50% { box-shadow: 0 0 40px 5px rgba(168, 85, 247, 0.5); background: rgba(168, 85, 247, 0.08); transform: scale(1.01); }
    100% { box-shadow: 0 0 0px rgba(168, 85, 247, 0); background: rgba(168, 85, 247, 0); transform: scale(1); }
  }
  .ai-improving {
    animation: aiGlow 1.5s ease-in-out infinite !important;
    position: relative !important;
    z-index: 5000 !important;
    pointer-events: none !important;
    border-radius: 12px;
    outline: 2px solid rgba(168, 85, 247, 0.5) !important;
  }
  
  @media only screen and (max-width: 600px) {
    .grid-quad-td {
      display: inline-block !important;
      width: 50% !important;
      box-sizing: border-box !important;
      padding: 4px !important;
    }
  }

  /* Responsive Grid Images via CSS Variables */
  img.grid-img {
    height: var(--grid-img-h, 150px) !important;
    object-fit: cover !important;
  }
  @media only screen and (max-width: 600px) {
    img.grid-img {
      height: calc(var(--grid-img-h, 150px) * 0.5) !important;
    }
  }

  /* Responsive Main Images (Cards and Image Modules) */
  .main-img-responsive {
    height: var(--main-img-h, auto) !important;
    object-fit: cover !important;
    width: 100% !important;
  }
  @media only screen and (max-width: 600px) {
    .main-img-responsive {
      height: calc(var(--main-img-h, 300px) * 0.5) !important;
    }
  }
`
