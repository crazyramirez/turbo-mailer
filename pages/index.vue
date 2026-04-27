<script setup lang="ts">
// Página de señuelo (Decoy) - No requiere autenticación
definePageMeta({ layout: false });

const isAuthed = useState<boolean | null>("isAuthed", () => null);

// Si el usuario ya está autenticado, lo llevamos al dashboard real
onMounted(() => {
  if (isAuthed.value) {
    navigateTo("/dashboard");
  }
});
</script>

<template>
  <div class="decoy-root">
    <div class="status-container">
      <div class="pulse-ring"></div>
      <div class="status-dot"></div>
      <div class="status-text">
        <span class="node-id">NODE_EU_04 // SMTP_RELAY</span>
        <span class="node-status">STATUS: OPERATIONAL</span>
      </div>
    </div>
    
    <div class="terminal-ghost">
      <p class="line">Ready for incoming requests...</p>
      <p class="line">Waiting for transport layer handshake...</p>
      <p class="line opacity-40">Encryption: TLS 1.3 Active</p>
    </div>
  </div>
</template>

<style scoped>
.decoy-root {
  background: #03040a;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  color: #1e293b;
  overflow: hidden;
}

.status-container {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  z-index: 2;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 15px #10b981;
}

.pulse-ring {
  position: absolute;
  left: -6px;
  width: 20px;
  height: 20px;
  border: 1px solid #10b981;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.node-id {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #334155;
}

.node-status {
  font-size: 10px;
  font-weight: 600;
  color: #10b981;
  opacity: 0.8;
}

.terminal-ghost {
  margin-top: 40px;
  text-align: center;
}

.line {
  font-size: 10px;
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}

@keyframes pulse {
  0% { transform: scale(0.5); opacity: 0.8; }
  100% { transform: scale(2.5); opacity: 0; }
}
</style>
