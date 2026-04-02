<script setup lang="ts">
import { onUnmounted, watch } from 'vue'

type PanelMetric = {
  key: string
  label: string
  value: string | number
  tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger'
}

type PanelAction = {
  key: string
  label: string
  tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger'
  disabled?: boolean
  loading?: boolean
}

type PanelEntry = {
  key: string
  title: string
  subtitle?: string
  meta?: string
  badge?: string
  image?: string
  tone?: 'bag' | 'friends' | 'task' | 'visitor' | 'neutral'
  actionLabel?: string
  actionKey?: string
  actionDisabled?: boolean
  actionLoading?: boolean
}

const props = withDefaults(defineProps<{
  show: boolean
  title: string
  subtitle: string
  eyebrow?: string
  tone?: 'bag' | 'friends' | 'task' | 'visitor'
  illustration?: string
  metrics?: PanelMetric[]
  actions?: PanelAction[]
  entries?: PanelEntry[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  primaryLabel?: string
  secondaryLabel?: string
  hint?: string
}>(), {
  eyebrow: '田园弹层',
  tone: 'bag',
  illustration: '',
  metrics: () => [],
  actions: () => [],
  entries: () => [],
  loading: false,
  emptyTitle: '当前没有可展示的内容',
  emptyDescription: '稍后再试，或者直接进入完整页面查看更多细节。',
  primaryLabel: '进入完整页面',
  secondaryLabel: '关闭',
  hint: '',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'primary'): void
  (e: 'action', item: PanelAction): void
  (e: 'entry-action', item: PanelEntry): void
}>()

function closePanel() {
  emit('close')
}

function handlePrimary() {
  emit('primary')
}

function handleAction(item: PanelAction) {
  emit('action', item)
}

function handleEntryAction(item: PanelEntry) {
  emit('entry-action', item)
}

function syncBodyScrollLock(locked: boolean) {
  if (typeof document === 'undefined')
    return
  document.body.style.overflow = locked ? 'hidden' : ''
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    closePanel()
}

watch(() => props.show, (next) => {
  syncBodyScrollLock(next)
  if (typeof window === 'undefined')
    return

  if (next)
    window.addEventListener('keydown', handleWindowKeydown)
  else
    window.removeEventListener('keydown', handleWindowKeydown)
}, { immediate: true })

onUnmounted(() => {
  syncBodyScrollLock(false)
  if (typeof window !== 'undefined')
    window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="pastoral-quick-panel-shell fixed inset-0 z-[90] flex items-end justify-center p-3 md:items-center md:p-6"
    >
      <div class="pastoral-quick-panel-shell__backdrop absolute inset-0" @click="closePanel" />

      <section
        class="pastoral-quick-panel relative z-10 max-h-[88vh] w-full max-w-5xl flex flex-col overflow-hidden rounded-[2rem]"
        :class="`pastoral-quick-panel--${tone}`"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.stop
      >
        <div class="pastoral-quick-panel__hero">
          <div class="pastoral-quick-panel__hero-copy">
            <div class="pastoral-quick-panel__eyebrow">
              {{ eyebrow }}
            </div>
            <h2 class="pastoral-quick-panel__title">
              {{ title }}
            </h2>
            <p class="pastoral-quick-panel__subtitle">
              {{ subtitle }}
            </p>
          </div>

          <div v-if="illustration" class="pastoral-quick-panel__hero-art">
            <img :src="illustration" :alt="title">
          </div>

          <button
            type="button"
            class="pastoral-quick-panel__close"
            aria-label="关闭田园弹层"
            @click="closePanel"
          >
            <div class="i-carbon-close text-lg" />
          </button>
        </div>

        <div class="pastoral-quick-panel__body custom-scrollbar">
          <div v-if="loading" class="pastoral-quick-panel__loading">
            <div class="i-svg-spinners-ring-resize text-3xl" />
            <div class="pastoral-quick-panel__loading-title">
              正在整理这一块内容
            </div>
            <p>我在把主程序里的真实数据装进田园抽屉，请稍等一下。</p>
          </div>

          <template v-else>
            <div v-if="metrics.length" class="pastoral-quick-panel__metrics">
              <article
                v-for="item in metrics"
                :key="item.key"
                class="pastoral-quick-panel__metric"
                :class="`is-${item.tone || 'neutral'}`"
              >
                <div class="pastoral-quick-panel__metric-label">
                  {{ item.label }}
                </div>
                <div class="pastoral-quick-panel__metric-value">
                  {{ item.value }}
                </div>
              </article>
            </div>

            <div v-if="actions.length" class="pastoral-quick-panel__actions">
              <button
                v-for="item in actions"
                :key="item.key"
                type="button"
                class="pastoral-quick-panel__action"
                :class="`is-${item.tone || 'neutral'}`"
                :disabled="item.disabled || item.loading"
                @click="handleAction(item)"
              >
                <div v-if="item.loading" class="i-svg-spinners-ring-resize text-sm" />
                <span v-else>{{ item.label }}</span>
              </button>
            </div>

            <div v-if="entries.length" class="pastoral-quick-panel__entries">
              <article
                v-for="item in entries"
                :key="item.key"
                class="pastoral-quick-panel__entry"
                :class="`is-${item.tone || 'neutral'}`"
              >
                <div class="pastoral-quick-panel__entry-media">
                  <img v-if="item.image" :src="item.image" :alt="item.title">
                  <span v-else>{{ item.badge || item.title.slice(0, 2) }}</span>
                </div>

                <div class="pastoral-quick-panel__entry-main">
                  <div class="pastoral-quick-panel__entry-title">
                    {{ item.title }}
                  </div>
                  <p v-if="item.subtitle" class="pastoral-quick-panel__entry-subtitle">
                    {{ item.subtitle }}
                  </p>
                  <div v-if="item.meta" class="pastoral-quick-panel__entry-meta">
                    {{ item.meta }}
                  </div>
                </div>

                <button
                  v-if="item.actionLabel"
                  type="button"
                  class="pastoral-quick-panel__entry-action"
                  :disabled="item.actionDisabled || item.actionLoading"
                  @click.stop="handleEntryAction(item)"
                >
                  <div v-if="item.actionLoading" class="i-svg-spinners-ring-resize text-sm" />
                  <span v-else>{{ item.actionLabel }}</span>
                </button>
              </article>
            </div>

            <div v-else class="pastoral-quick-panel__empty">
              <div class="i-carbon-cloud-offline text-3xl" />
              <h3>{{ emptyTitle }}</h3>
              <p>{{ emptyDescription }}</p>
            </div>
          </template>
        </div>

        <footer class="pastoral-quick-panel__footer">
          <p class="pastoral-quick-panel__hint">
            {{ hint || '这里先做田园风预览，不直接在弹层里塞满所有旧页面交互。' }}
          </p>

          <div class="pastoral-quick-panel__footer-actions">
            <button type="button" class="pastoral-quick-panel__secondary" @click="closePanel">
              {{ secondaryLabel }}
            </button>
            <button type="button" class="pastoral-quick-panel__primary" @click="handlePrimary">
              {{ primaryLabel }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.pastoral-quick-panel-shell__backdrop {
  background:
    radial-gradient(circle at 20% 20%, rgba(255, 241, 206, 0.24), transparent 24%),
    radial-gradient(circle at 80% 12%, rgba(166, 218, 255, 0.18), transparent 22%),
    color-mix(in srgb, var(--ui-overlay-backdrop) 88%, transparent);
  backdrop-filter: blur(14px);
}

.pastoral-quick-panel {
  border: 1px solid rgba(255, 255, 255, 0.82);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(249, 252, 255, 0.88)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02));
  box-shadow:
    0 36px 84px rgba(40, 61, 52, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
}

.pastoral-quick-panel--bag {
  --pastoral-panel-accent: #6fad54;
  --pastoral-panel-accent-soft: rgba(111, 173, 84, 0.18);
}

.pastoral-quick-panel--friends {
  --pastoral-panel-accent: #62a6d9;
  --pastoral-panel-accent-soft: rgba(98, 166, 217, 0.18);
}

.pastoral-quick-panel--task {
  --pastoral-panel-accent: #d89d3c;
  --pastoral-panel-accent-soft: rgba(216, 157, 60, 0.2);
}

.pastoral-quick-panel--visitor {
  --pastoral-panel-accent: #d27f67;
  --pastoral-panel-accent-soft: rgba(210, 127, 103, 0.2);
}

.pastoral-quick-panel__hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  padding: 1.35rem 1.4rem 1.15rem;
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.36), transparent 34%),
    linear-gradient(135deg, var(--pastoral-panel-accent-soft), rgba(255, 255, 255, 0.08));
  border-bottom: 1px solid rgba(255, 255, 255, 0.68);
}

.pastoral-quick-panel__hero-copy {
  min-width: 0;
}

.pastoral-quick-panel__eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 1.85rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
  color: color-mix(in srgb, var(--pastoral-panel-accent) 76%, #654930 24%);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pastoral-quick-panel__title {
  margin: 0.8rem 0 0;
  color: #5e3d27;
  font-size: clamp(1.6rem, 2vw, 2rem);
  line-height: 1.08;
  font-weight: 900;
}

.pastoral-quick-panel__subtitle {
  max-width: 42rem;
  margin: 0.5rem 0 0;
  color: rgba(94, 61, 39, 0.78);
  font-size: 0.9rem;
  line-height: 1.65;
}

.pastoral-quick-panel__hero-art {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding-right: 3.2rem;
}

.pastoral-quick-panel__hero-art img {
  width: 5.5rem;
  height: 5.5rem;
  object-fit: contain;
  filter: drop-shadow(0 14px 18px rgba(89, 61, 36, 0.16));
}

.pastoral-quick-panel__close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #6c523e;
  transition: transform var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-quick-panel__close:hover {
  transform: translateY(-1px) rotate(8deg);
  background: rgba(255, 255, 255, 0.92);
}

.pastoral-quick-panel__body {
  overflow-y: auto;
  padding: 1.1rem 1.4rem 1.25rem;
}

.pastoral-quick-panel__loading,
.pastoral-quick-panel__empty {
  display: flex;
  min-height: 18rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  border: 1px dashed rgba(127, 165, 144, 0.34);
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.58);
  text-align: center;
  padding: 1.5rem;
}

.pastoral-quick-panel__loading-title,
.pastoral-quick-panel__empty h3 {
  color: #4b5b4f;
  font-size: 1.08rem;
  font-weight: 800;
}

.pastoral-quick-panel__loading p,
.pastoral-quick-panel__empty p {
  max-width: 28rem;
  margin: 0;
  color: var(--ui-text-2);
  font-size: 0.88rem;
  line-height: 1.7;
}

.pastoral-quick-panel__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.pastoral-quick-panel__metric {
  padding: 0.9rem 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.pastoral-quick-panel__metric.is-success {
  background: color-mix(in srgb, var(--ui-status-success) 10%, rgba(255, 255, 255, 0.88));
}

.pastoral-quick-panel__metric.is-info {
  background: color-mix(in srgb, var(--ui-status-info) 10%, rgba(255, 255, 255, 0.88));
}

.pastoral-quick-panel__metric.is-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 12%, rgba(255, 255, 255, 0.88));
}

.pastoral-quick-panel__metric.is-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 9%, rgba(255, 255, 255, 0.9));
}

.pastoral-quick-panel__metric-label {
  color: rgba(101, 86, 71, 0.74);
  font-size: 0.72rem;
  font-weight: 800;
}

.pastoral-quick-panel__metric-value {
  margin-top: 0.35rem;
  color: #41584a;
  font-size: 1.35rem;
  line-height: 1.1;
  font-weight: 900;
}

.pastoral-quick-panel__entries {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.pastoral-quick-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1rem;
}

.pastoral-quick-panel__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.15rem;
  padding: 0 0.92rem;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(250, 247, 242, 0.9)),
    linear-gradient(135deg, var(--pastoral-panel-accent-soft), rgba(255, 255, 255, 0.04));
  color: #5f4734;
  box-shadow: 0 14px 28px -24px color-mix(in srgb, var(--pastoral-panel-accent) 42%, transparent);
  font-size: 0.77rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast);
}

.pastoral-quick-panel__action:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 18px 32px -24px color-mix(in srgb, var(--pastoral-panel-accent) 46%, transparent);
}

.pastoral-quick-panel__action.is-success {
  color: #2f7d3b;
}

.pastoral-quick-panel__action.is-info {
  color: #2f6e9e;
}

.pastoral-quick-panel__action.is-warning {
  color: #9a6116;
}

.pastoral-quick-panel__action.is-danger {
  color: #b14444;
}

.pastoral-quick-panel__action:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  box-shadow: none;
}

.pastoral-quick-panel__entry {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.3rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(250, 247, 242, 0.82)),
    linear-gradient(135deg, var(--pastoral-panel-accent-soft), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.pastoral-quick-panel__entry-media {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border-radius: 1rem;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.32)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), var(--pastoral-panel-accent-soft));
  color: color-mix(in srgb, var(--pastoral-panel-accent) 72%, #73553c 28%);
  font-size: 0.86rem;
  font-weight: 900;
}

.pastoral-quick-panel__entry-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pastoral-quick-panel__entry-main {
  min-width: 0;
}

.pastoral-quick-panel__entry-title {
  color: #564131;
  font-size: 0.96rem;
  font-weight: 900;
}

.pastoral-quick-panel__entry-subtitle {
  margin: 0.3rem 0 0;
  color: rgba(86, 65, 49, 0.78);
  font-size: 0.8rem;
  line-height: 1.5;
}

.pastoral-quick-panel__entry-meta {
  display: inline-flex;
  align-items: center;
  min-height: 1.55rem;
  margin-top: 0.45rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
  color: rgba(86, 65, 49, 0.72);
  font-size: 0.7rem;
  font-weight: 700;
}

.pastoral-quick-panel__entry-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.2rem;
  min-width: 5.1rem;
  padding: 0 0.9rem;
  border: 1px solid color-mix(in srgb, var(--pastoral-panel-accent) 36%, rgba(255, 255, 255, 0.78));
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 249, 240, 0.88)),
    linear-gradient(135deg, var(--pastoral-panel-accent-soft), rgba(255, 255, 255, 0.08));
  color: color-mix(in srgb, var(--pastoral-panel-accent) 78%, #6b523d 22%);
  box-shadow: 0 14px 28px -22px color-mix(in srgb, var(--pastoral-panel-accent) 44%, transparent);
  font-size: 0.78rem;
  font-weight: 900;
  white-space: nowrap;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast);
}

.pastoral-quick-panel__entry-action:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 18px 32px -20px color-mix(in srgb, var(--pastoral-panel-accent) 48%, transparent);
}

.pastoral-quick-panel__entry-action:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  box-shadow: none;
}

.pastoral-quick-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.4rem 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.72);
}

.pastoral-quick-panel__hint {
  margin: 0;
  color: rgba(94, 61, 39, 0.72);
  font-size: 0.78rem;
  line-height: 1.6;
}

.pastoral-quick-panel__footer-actions {
  display: flex;
  gap: 0.75rem;
}

.pastoral-quick-panel__secondary,
.pastoral-quick-panel__primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1.1rem;
  border-radius: 999px;
  font-size: 0.88rem;
  font-weight: 800;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-quick-panel__secondary {
  border: 1px solid rgba(196, 175, 149, 0.6);
  background: rgba(255, 255, 255, 0.84);
  color: #6b523d;
}

.pastoral-quick-panel__primary {
  border: 1px solid color-mix(in srgb, var(--pastoral-panel-accent) 50%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--pastoral-panel-accent) 74%, #ffffff 26%), color-mix(in srgb, var(--pastoral-panel-accent) 86%, #72563f 14%));
  color: #fffaf4;
  box-shadow: 0 16px 30px -18px color-mix(in srgb, var(--pastoral-panel-accent) 44%, transparent);
}

.pastoral-quick-panel__secondary:hover,
.pastoral-quick-panel__primary:hover {
  transform: translateY(-1px);
}

@media (max-width: 959px) {
  .pastoral-quick-panel__hero {
    grid-template-columns: 1fr;
  }

  .pastoral-quick-panel__hero-art {
    justify-content: flex-start;
    padding-right: 0;
  }

  .pastoral-quick-panel__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-quick-panel__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .pastoral-quick-panel__footer-actions {
    width: 100%;
    justify-content: stretch;
  }

  .pastoral-quick-panel__secondary,
  .pastoral-quick-panel__primary {
    flex: 1;
  }
}

@media (max-width: 639px) {
  .pastoral-quick-panel {
    max-height: 92vh;
    border-radius: 1.7rem;
  }

  .pastoral-quick-panel__hero,
  .pastoral-quick-panel__body,
  .pastoral-quick-panel__footer {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .pastoral-quick-panel__metrics {
    grid-template-columns: 1fr;
  }

  .pastoral-quick-panel__actions {
    flex-direction: column;
  }

  .pastoral-quick-panel__entry {
    grid-template-columns: 3rem minmax(0, 1fr);
    padding: 0.8rem;
  }

  .pastoral-quick-panel__entry-media {
    width: 3rem;
    height: 3rem;
  }

  .pastoral-quick-panel__entry-action {
    grid-column: 2;
    justify-self: flex-start;
    min-width: 4.8rem;
  }

  .pastoral-quick-panel__footer-actions {
    flex-direction: column;
  }
}
</style>
