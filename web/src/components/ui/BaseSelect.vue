<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  label?: string
  options?: { label: string, value: string | number, disabled?: boolean, description?: string }[]
  disabled?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'change', value: string | number): void
}>()

const model = defineModel<string | number>()

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const selected = props.options?.find(opt => opt.value === model.value)
  return selected ? selected.label : (props.placeholder || '请选择')
})

function toggleDropdown() {
  if (props.disabled)
    return
  isOpen.value = !isOpen.value
}

function selectOption(value: string | number) {
  model.value = value
  isOpen.value = false
  emit('change', value)
}

function closeDropdown(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <div ref="containerRef" class="flex flex-col gap-1.5">
    <label v-if="label" class="glass-text-muted text-sm font-medium">
      {{ label }}
    </label>
    <div class="relative">
      <!-- Trigger -->
      <div
        class="glass-text-main w-full flex cursor-pointer items-center justify-between border border-gray-200/50 rounded-lg bg-black/5 px-3 py-2 shadow-sm outline-none backdrop-blur-sm transition-all duration-200 dark:border-white/10 dark:bg-black/20 hover:bg-black/10 dark:hover:bg-black/40"
        :class="{
          'bg-gray-50/50 text-gray-400 cursor-not-allowed dark:bg-black/40 hover:bg-gray-50/50 dark:hover:bg-black/40': disabled,
          'ring-2 ring-primary-500/20 border-primary-500 dark:focus:border-primary-500': isOpen,
          'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20': !disabled,
        }"
        @click="toggleDropdown"
      >
        <span class="truncate">{{ selectedLabel }}</span>
        <div class="i-carbon-chevron-down text-lg text-gray-400 transition-transform duration-200" :class="{ 'rotate-180': isOpen }" />
      </div>

      <!-- Dropdown Menu -->
      <Transition
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div
          v-if="isOpen"
          class="glass-panel absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto border border-gray-200/50 rounded-lg py-1 shadow-lg dark:border-white/10"
        >
          <template v-if="options?.length">
            <div
              v-for="opt in options"
              :key="opt.value"
              class="cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              :class="{
                'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400': model === opt.value,
                'text-gray-400 cursor-not-allowed hover:bg-transparent dark:text-gray-500': opt.disabled,
                'glass-text-main': model !== opt.value && !opt.disabled,
              }"
              @click="!opt.disabled && selectOption(opt.value)"
            >
              <slot name="option" :option="opt" :selected="model === opt.value">
                <div class="flex flex-col">
                  <span>{{ opt.label }}</span>
                  <span v-if="opt.description" class="mt-0.5 text-[10px] leading-tight opacity-60 dark:opacity-50">
                    {{ opt.description }}
                  </span>
                </div>
              </slot>
            </div>
          </template>
          <div v-else class="px-3 py-2 text-center text-sm text-gray-400">
            暂无选项
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
