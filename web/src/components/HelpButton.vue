<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isHovering = ref(false)

function navigateToHelp() {
  router.push('/help')
}
</script>

<template>
  <button
    class="help-button"
    :class="{ 'is-hovering': isHovering }"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
    @click="navigateToHelp"
  >
    <div class="button-content">
      <div class="i-carbon-help button-icon" />
      <transition name="fade">
        <span v-if="isHovering" class="button-label">帮助中心</span>
      </transition>
    </div>
  </button>
</template>

<style scoped>
.help-button {
  @apply fixed bottom-6 right-6 z-50;
  @apply flex items-center gap-2 px-4 py-3;
  @apply bg-gradient-to-r from-blue-600 to-indigo-600;
  @apply text-white rounded-full shadow-lg;
  @apply transition-all duration-300 ease-out;
  @apply hover:shadow-xl hover:scale-110;
  @apply focus:outline-none focus:ring-4 focus:ring-blue-500/30;
  animation: pulse 4s infinite ease-in-out;
}

.help-button.is-hovering {
  animation-play-state: paused;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.3);
  }
  50% {
    box-shadow: 0 4px 28px rgba(37, 99, 235, 0.45);
  }
}

.button-content {
  @apply flex items-center gap-2;
}

.button-icon {
  @apply text-2xl;
}

.button-label {
  @apply text-sm font-medium whitespace-nowrap;
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .help-button {
    @apply from-blue-500 to-indigo-500;
  }
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  @apply transition-opacity duration-200;
}

.fade-enter-from {
  @apply opacity-0;
}

.fade-leave-to {
  @apply opacity-0;
}
</style>
