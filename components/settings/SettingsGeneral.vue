<script setup lang="ts">
const { t, locale, setLocale } = useI18n();
const { can } = useMe();
const { draftOf, save, saving } = useSettings();
const d = reactive(draftOf(["trackingBaseUrl", "companyName", "companyAddress", "defaultLocale"]));

async function changeInterfaceLocale(event: Event) {
  const nextLocale = (event.target as HTMLSelectElement).value;
  if (nextLocale === "es" || nextLocale === "en") {
    await setLocale(nextLocale);
  }
}
</script>

<template>
  <div class="tm-grid-2">
    <section v-if="can('admin')" class="tm-card">
      <h3 class="tm-card-title">{{ t("settings.general.identity") }}</h3>
      <div class="tm-field">
        <label>{{ t("settings.general.base_url") }}</label>
        <input v-model="d.trackingBaseUrl" class="tm-input" placeholder="https://mail.tuempresa.com" />
        <p class="tm-hint">{{ t("settings.general.base_url_hint") }}</p>
      </div>
      <div class="tm-field">
        <label>{{ t("settings.general.company") }}</label>
        <input v-model="d.companyName" class="tm-input" />
      </div>
      <div class="tm-field">
        <label>{{ t("settings.general.address") }}</label>
        <textarea v-model="d.companyAddress" class="tm-textarea" rows="2" :placeholder="t('settings.general.address_ph')"></textarea>
        <p class="tm-hint">{{ t("settings.general.address_hint") }}</p>
      </div>
      <div class="tm-field">
        <label>{{ t("settings.general.locale") }}</label>
        <select v-model="d.defaultLocale" class="tm-select">
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      <div class="tm-actions">
        <button class="tm-btn tm-btn-primary" :disabled="saving" @click="save({ ...d })">{{ t("settings.save") }}</button>
      </div>
    </section>
    <section class="tm-card">
      <h3 class="tm-card-title">{{ t("settings.general.interface") }}</h3>
      <div class="tm-field">
        <label for="interface-locale">{{ t("settings.general.interface_locale") }}</label>
        <select id="interface-locale" :value="locale" class="tm-select" aria-describedby="interface-locale-hint" @change="changeInterfaceLocale">
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
        <p id="interface-locale-hint" class="tm-hint">{{ t("settings.general.interface_locale_hint") }}</p>
      </div>
    </section>
  </div>
</template>
