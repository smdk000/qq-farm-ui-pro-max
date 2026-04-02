<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PastoralView from '@/views/PastoralView.vue'
import { readPastoralRememberedRoute } from '@/utils/pastoral-view'

const router = useRouter()
const rememberedRoute = ref(readPastoralRememberedRoute())

const rememberedLabel = computed(() => rememberedRoute.value?.label || '概览')
const rememberedNote = computed(() => {
  if (rememberedRoute.value?.label)
    return `上次工作页：${rememberedRoute.value.label}`
  return '未记录最近工作页，默认返回概览'
})

function refreshRememberedRoute() {
  rememberedRoute.value = readPastoralRememberedRoute()
}

function returnToConsole() {
  refreshRememberedRoute()
  const fullPath = String(rememberedRoute.value?.fullPath || '').trim()
  if (fullPath) {
    void router.push(fullPath)
    return
  }
  void router.push({ name: 'dashboard' })
}

function openSettings() {
  void router.push({ name: 'Settings' })
}
</script>

<template>
  <div class="pastoral-fullscreen-page h-full min-h-0 w-full overflow-y-auto">
    <div class="pastoral-fullscreen-nav">
      <div class="pastoral-fullscreen-nav__brand">
        <div class="i-carbon-sprout text-lg" />
        <div>
          <div class="pastoral-fullscreen-nav__title">
            田园全屏界面
          </div>
          <div class="pastoral-fullscreen-nav__note">
            {{ rememberedNote }}
          </div>
        </div>
      </div>

      <div class="pastoral-fullscreen-nav__actions">
        <button type="button" class="pastoral-fullscreen-nav__btn is-secondary" @click="openSettings">
          <div class="i-carbon-settings-adjust mr-2 text-base" />
          领奖与配置
        </button>
        <button type="button" class="pastoral-fullscreen-nav__btn is-primary" @click="returnToConsole">
          <div class="i-carbon-arrow-left mr-2 text-base" />
          返回{{ rememberedLabel }}
        </button>
      </div>
    </div>

    <div class="pastoral-fullscreen-page__inner min-h-[calc(100vh-78px)] w-full px-0 py-0">
      <PastoralView />
    </div>
  </div>
</template>

<style scoped>
.pastoral-fullscreen-page {
  position: relative;
  background:
    radial-gradient(circle at top, rgba(137, 180, 255, 0.16), transparent 30%),
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-app) 94%, #f7fbff 6%), color-mix(in srgb, var(--ui-bg-app) 98%, #0f172a 2%));
}

.pastoral-fullscreen-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent), color-mix(in srgb, var(--ui-bg-surface) 74%, transparent)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(18px);
  box-shadow: 0 14px 34px -28px var(--ui-shadow-panel);
}

.pastoral-fullscreen-nav__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  color: var(--ui-text-1);
}

.pastoral-fullscreen-nav__title {
  font-size: 1rem;
  font-weight: 900;
}

.pastoral-fullscreen-nav__note {
  color: var(--ui-text-3);
  font-size: 0.76rem;
  line-height: 1.5;
}

.pastoral-fullscreen-nav__actions {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.pastoral-fullscreen-nav__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.7rem;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  font-size: 0.86rem;
  font-weight: 800;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-fullscreen-nav__btn:hover {
  transform: translateY(-1px);
}

.pastoral-fullscreen-nav__btn.is-secondary {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: var(--ui-text-1);
}

.pastoral-fullscreen-nav__btn.is-primary {
  background: linear-gradient(180deg, #f9d98f, #ecb85a);
  color: #7b4f15;
  box-shadow: 0 18px 30px -20px rgba(236, 184, 90, 0.68);
}

.pastoral-fullscreen-page__inner {
  position: relative;
  z-index: 1;
}

@media (max-width: 767px) {
  .pastoral-fullscreen-nav {
    flex-direction: column;
    align-items: stretch;
    padding: 0.8rem 0.9rem;
  }

  .pastoral-fullscreen-nav__actions {
    width: 100%;
    flex-direction: column;
  }

  .pastoral-fullscreen-nav__btn {
    width: 100%;
  }
}
</style>
