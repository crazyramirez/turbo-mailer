<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const sendId = route.query.s
const token = route.query.t

interface PrefData {
  maskedEmail: string
  status: string
  preferences: { frequency?: 'all' | 'weekly' | 'monthly' }
}

const data = ref<PrefData | null>(null)
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const unsubDone = ref(false)
const error = ref('')
const frequency = ref<'all' | 'weekly' | 'monthly'>('all')

onMounted(async () => {
  try {
    const res = await $fetch<PrefData>('/api/preferences', {
      query: { s: sendId, t: token },
    })
    data.value = res
    frequency.value = res.preferences?.frequency ?? 'all'
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Enlace inválido o expirado.'
  } finally {
    loading.value = false
  }
})

async function savePreferences() {
  if (!data.value) return
  saving.value = true
  try {
    await $fetch('/api/preferences', {
      method: 'POST',
      body: { s: sendId, t: token, frequency: frequency.value },
    })
    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Error al guardar.'
  } finally {
    saving.value = false
  }
}

async function unsubscribeAll() {
  if (!data.value) return
  saving.value = true
  try {
    await $fetch('/api/preferences', {
      method: 'POST',
      body: { s: sendId, t: token, unsubscribeAll: true },
    })
    unsubDone.value = true
    if (data.value) data.value.status = 'unsubscribed'
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Error al procesar.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="pref-page">
    <div class="pref-card">
      <div class="pref-logo">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="10" fill="#6366f1"/>
          <path d="M8 11l8 6 8-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="6" y="9" width="20" height="14" rx="3" stroke="#fff" stroke-width="2"/>
        </svg>
        <span class="pref-brand">TurboMailer</span>
      </div>

      <div v-if="loading" class="pref-loading">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="pref-error">
        <p>{{ error }}</p>
      </div>

      <template v-else-if="data">
        <div class="pref-email">{{ data.maskedEmail }}</div>

        <div v-if="unsubDone || data.status === 'unsubscribed'" class="pref-unsub-done">
          <div class="checkmark">✓</div>
          <p>Has sido dado de baja de todas las comunicaciones.</p>
        </div>

        <template v-else>
          <h1 class="pref-title">Preferencias de comunicación</h1>
          <p class="pref-sub">Gestiona cómo y cuándo quieres recibir emails.</p>

          <div class="pref-section">
            <label class="pref-label">Frecuencia de emails</label>
            <div class="freq-options">
              <label class="freq-opt" :class="{ active: frequency === 'all' }">
                <input type="radio" v-model="frequency" value="all" />
                <div class="freq-content">
                  <span class="freq-title">Todas las comunicaciones</span>
                  <span class="freq-desc">Recibe todos los emails de campañas</span>
                </div>
              </label>
              <label class="freq-opt" :class="{ active: frequency === 'weekly' }">
                <input type="radio" v-model="frequency" value="weekly" />
                <div class="freq-content">
                  <span class="freq-title">Resumen semanal</span>
                  <span class="freq-desc">Solo el email más importante por semana</span>
                </div>
              </label>
              <label class="freq-opt" :class="{ active: frequency === 'monthly' }">
                <input type="radio" v-model="frequency" value="monthly" />
                <div class="freq-content">
                  <span class="freq-title">Resumen mensual</span>
                  <span class="freq-desc">Máximo un email al mes</span>
                </div>
              </label>
            </div>
          </div>

          <div class="pref-actions">
            <button
              class="btn-save"
              @click="savePreferences"
              :disabled="saving"
            >
              <span v-if="saved">✓ Guardado</span>
              <span v-else-if="saving">Guardando…</span>
              <span v-else>Guardar preferencias</span>
            </button>
          </div>

          <div class="pref-divider" />

          <div class="pref-unsub-section">
            <p class="pref-unsub-label">¿Quieres darte de baja completamente?</p>
            <button class="btn-unsub" @click="unsubscribeAll" :disabled="saving">
              Darme de baja de todo
            </button>
          </div>
        </template>
      </template>

      <div class="pref-footer">
        Gestionado por <strong>TurboMailer</strong>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pref-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #080a14;
  padding: 24px;
}

.pref-card {
  background: #0d0f1a;
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 24px;
  padding: 40px 36px;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}

.pref-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pref-brand {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.01em;
}

.pref-email {
  font-size: 13px;
  font-family: monospace;
  color: #818cf8;
  background: rgba(99,102,241,0.08);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 8px;
  padding: 6px 12px;
  display: inline-block;
}

.pref-title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
.pref-sub {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.pref-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
}

.freq-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.freq-opt {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
}
.freq-opt input[type="radio"] { display: none; }
.freq-opt.active {
  border-color: rgba(99,102,241,0.5);
  background: rgba(99,102,241,0.07);
}
.freq-opt:hover:not(.active) { border-color: rgba(255,255,255,0.13); }
.freq-content { display: flex; flex-direction: column; gap: 3px; }
.freq-title {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}
.freq-desc {
  font-size: 12px;
  color: #64748b;
}
.freq-opt.active .freq-title { color: #818cf8; }

.pref-actions { display: flex; }
.btn-save {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s, opacity 0.18s;
}
.btn-save:hover:not(:disabled) { background: #5254cc; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

.pref-divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
}

.pref-unsub-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.pref-unsub-label {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}
.btn-unsub {
  font-size: 12px;
  font-weight: 600;
  color: #f87171;
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.2);
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.18s;
}
.btn-unsub:hover:not(:disabled) { background: rgba(248,113,113,0.16); }
.btn-unsub:disabled { opacity: 0.5; cursor: not-allowed; }

.pref-unsub-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 0;
  text-align: center;
}
.checkmark {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(16,185,129,0.1);
  border: 2px solid rgba(16,185,129,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #10b981;
}
.pref-unsub-done p {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}

.pref-loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(99,102,241,0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.pref-error {
  padding: 16px;
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px;
  color: #f87171;
  font-size: 13px;
  text-align: center;
}
.pref-error p { margin: 0; }

.pref-footer {
  font-size: 11px;
  color: #334155;
  text-align: center;
}
.pref-footer strong { color: #475569; }
</style>
