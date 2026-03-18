<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { getRecentClientErrors } from '@/utils/bug-report-client-errors'
import { collectBugReportClientContext } from '@/utils/bug-report-context'
import { localizeRuntimeText } from '@/utils/runtime-text'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const FALLBACK_CATEGORY_OPTIONS = [
  { label: '登录问题', value: 'login' },
  { label: '账号运行', value: 'runtime' },
  { label: '好友功能', value: 'friend' },
  { label: '农场功能', value: 'farm' },
  { label: '页面显示', value: 'ui' },
  { label: '性能卡顿', value: 'performance' },
  { label: '其他问题', value: 'other' },
]

const FALLBACK_SEVERITY_OPTIONS = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '阻断', value: 'critical' },
]

const route = useRoute()
const toast = useToastStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const { currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)

const loadingConfig = ref(false)
const submitting = ref(false)
const configError = ref('')
const submitResult = ref<{ reportId: string, mailSent: boolean, mailMessage: string } | null>(null)
const remoteConfig = ref({
  enabled: true,
  canSubmit: true,
  requiresAdmin: false,
  maxTitleLength: 120,
  maxDescriptionLength: 5000,
  categoryOptions: FALLBACK_CATEGORY_OPTIONS,
  severityOptions: FALLBACK_SEVERITY_OPTIONS,
})

const form = reactive({
  title: '',
  category: 'other',
  severity: 'medium',
  description: '',
  stepsToReproduce: '',
  expectedResult: '',
  actualResult: '',
  contact: '',
})

const validationErrors = computed(() => {
  const errors: string[] = []
  if (!form.title.trim()) {
    errors.push('请填写问题标题')
  }
  if (!form.description.trim()) {
    errors.push('请填写问题描述')
  }
  if (form.title.trim().length > remoteConfig.value.maxTitleLength) {
    errors.push(`标题最多 ${remoteConfig.value.maxTitleLength} 个字符`)
  }
  if (form.description.trim().length > remoteConfig.value.maxDescriptionLength) {
    errors.push(`描述最多 ${remoteConfig.value.maxDescriptionLength} 个字符`)
  }
  return errors
})

const submitDisabledReason = computed(() => {
  if (loadingConfig.value)
    return '正在读取配置...'
  if (configError.value)
    return configError.value
  if (!remoteConfig.value.enabled)
    return '管理员尚未开启问题反馈功能'
  if (remoteConfig.value.requiresAdmin)
    return '当前仅管理员可以提交问题反馈'
  if (!remoteConfig.value.canSubmit)
    return '当前暂不可提交问题反馈'
  return ''
})

const autoCollectedSummary = computed(() => {
  const frontendErrors = getRecentClientErrors(remoteConfig.value.maxDescriptionLength > 0 ? 10 : 10)
  return [
    `当前页面：${route.fullPath || '-'}`,
    `当前账号：${currentAccount.value?.name || currentAccount.value?.nick || currentAccount.value?.id || '未选择'}`,
    `实时连接：${realtimeConnected.value ? '已连接' : '未连接'}`,
    `最近前端错误：${frontendErrors.length} 条`,
    '系统会自动补充当前账号相关日志与运行状态',
  ]
})

async function loadConfig() {
  loadingConfig.value = true
  configError.value = ''
  try {
    const { data } = await api.get('/api/bug-report/config')
    if (data?.ok && data.data) {
      remoteConfig.value = {
        enabled: !!data.data.enabled,
        canSubmit: !!data.data.canSubmit,
        requiresAdmin: !!data.data.requiresAdmin,
        maxTitleLength: Number(data.data.maxTitleLength) || 120,
        maxDescriptionLength: Number(data.data.maxDescriptionLength) || 5000,
        categoryOptions: Array.isArray(data.data.categoryOptions) && data.data.categoryOptions.length > 0
          ? data.data.categoryOptions
          : FALLBACK_CATEGORY_OPTIONS,
        severityOptions: Array.isArray(data.data.severityOptions) && data.data.severityOptions.length > 0
          ? data.data.severityOptions
          : FALLBACK_SEVERITY_OPTIONS,
      }
      if (!remoteConfig.value.categoryOptions.some(item => item.value === form.category)) {
        form.category = String(remoteConfig.value.categoryOptions[0]?.value || 'other')
      }
      if (!remoteConfig.value.severityOptions.some(item => item.value === form.severity)) {
        form.severity = String(remoteConfig.value.severityOptions[1]?.value || remoteConfig.value.severityOptions[0]?.value || 'medium')
      }
    }
    else {
      configError.value = localizeRuntimeText(data?.error || '读取配置失败')
    }
  }
  catch (error: any) {
    configError.value = localizeRuntimeText(error?.response?.data?.error || error?.message || '读取配置失败')
  }
  finally {
    loadingConfig.value = false
  }
}

function resetForm() {
  form.title = ''
  form.category = 'other'
  form.severity = 'medium'
  form.description = ''
  form.stepsToReproduce = ''
  form.expectedResult = ''
  form.actualResult = ''
  form.contact = ''
}

function handleClose() {
  emit('close')
}

async function handleSubmit() {
  if (validationErrors.value.length > 0) {
    toast.warning(validationErrors.value[0] || '请先完善反馈内容')
    return
  }
  if (submitDisabledReason.value) {
    toast.warning(submitDisabledReason.value)
    return
  }

  submitting.value = true
  try {
    const clientContext = collectBugReportClientContext({
      route,
      account: currentAccount.value || null,
      status: status.value || null,
      realtimeConnected: realtimeConnected.value,
    })
    const frontendErrors = getRecentClientErrors(10)
    const { data } = await api.post('/api/bug-report/submit', {
      title: form.title.trim(),
      category: form.category,
      severity: form.severity,
      description: form.description.trim(),
      stepsToReproduce: form.stepsToReproduce.trim(),
      expectedResult: form.expectedResult.trim(),
      actualResult: form.actualResult.trim(),
      contact: form.contact.trim(),
      clientContext,
      frontendErrors,
    })

    if (data?.ok && data.data) {
      submitResult.value = {
        reportId: String(data.data.reportId || ''),
        mailSent: !!data.data.mailSent,
        mailMessage: String(data.data.mailMessage || ''),
      }
      resetForm()
      if (submitResult.value.mailSent) {
        toast.success(`反馈已提交，编号 ${submitResult.value.reportId}`)
      }
      else {
        toast.warning(`反馈已留档，邮件发送失败：${submitResult.value.mailMessage || '未知原因'}`)
      }
    }
  }
  catch (error: any) {
    const message = localizeRuntimeText(error?.response?.data?.error || error?.message || '提交失败')
    toast.error(`反馈提交失败: ${message}`)
  }
  finally {
    submitting.value = false
  }
}

watch(() => props.show, (visible) => {
  if (!visible)
    return
  submitResult.value = null
  void loadConfig()
}, { immediate: false })
</script>

<template>
  <Transition name="modal">
    <div
      v-if="show"
      class="bug-report-modal fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        class="bug-report-backdrop absolute inset-0 backdrop-blur-sm transition-opacity"
        @click="handleClose"
      />

      <div
        class="bug-report-panel glass-panel relative max-h-full max-w-3xl w-full flex flex-col overflow-hidden rounded-3xl shadow-2xl"
        @click.stop
      >
        <div class="bug-report-header flex items-center justify-between gap-4 px-6 py-5">
          <div class="flex items-center gap-3">
            <div class="bug-report-icon h-11 w-11 flex items-center justify-center rounded-2xl text-xl">
              <div class="i-carbon-bug" />
            </div>
            <div>
              <h3 class="glass-text-main text-xl font-bold">
                问题反馈
              </h3>
              <p class="glass-text-muted mt-1 text-xs">
                你的描述会和当前页面、账号状态、近期日志一起发送到管理员邮箱。
              </p>
            </div>
          </div>
          <button
            class="bug-report-close glass-text-muted hover:glass-text-main h-9 w-9 flex items-center justify-center rounded-xl transition-colors"
            title="关闭"
            @click="handleClose"
          >
            <div class="i-carbon-close text-lg" />
          </button>
        </div>

        <div class="bug-report-body custom-scrollbar flex-1 overflow-y-auto px-6 pb-6">
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <BaseBadge surface="meta" tone="info" class="rounded-full px-2 py-1 text-[11px]">
              当前账号：{{ currentAccount?.name || currentAccount?.nick || currentAccount?.id || '未选择' }}
            </BaseBadge>
            <BaseBadge surface="meta" :tone="realtimeConnected ? 'success' : 'warning'" class="rounded-full px-2 py-1 text-[11px]">
              {{ realtimeConnected ? '实时已连接' : '实时未连接' }}
            </BaseBadge>
            <BaseBadge v-if="status?.wsError?.message || currentAccount?.wsError?.message" surface="meta" tone="warning" class="rounded-full px-2 py-1 text-[11px]">
              最近存在连接异常
            </BaseBadge>
          </div>

          <div
            v-if="submitDisabledReason"
            class="bug-report-disabled mb-5 rounded-2xl px-4 py-4 text-sm"
          >
            <div class="flex items-start gap-3">
              <div class="i-carbon-warning-filled mt-0.5 text-lg" />
              <div>
                <p class="font-semibold">
                  当前暂不可提交
                </p>
                <p class="mt-1 opacity-90">
                  {{ submitDisabledReason }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="submitResult"
            class="bug-report-success mb-5 rounded-2xl px-4 py-4 text-sm"
          >
            <div class="flex items-start gap-3">
              <div class="i-carbon-checkmark-filled mt-0.5 text-lg" />
              <div>
                <p class="font-semibold">
                  反馈已提交
                </p>
                <p class="mt-1">
                  编号：<strong>{{ submitResult.reportId }}</strong>
                </p>
                <p class="mt-1 opacity-90">
                  {{ submitResult.mailSent ? '邮件已成功投递到管理员邮箱。' : `邮件发送失败：${submitResult.mailMessage || '未知原因'}` }}
                </p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BaseInput
              v-model="form.title"
              label="问题标题"
              :disabled="submitting"
              :placeholder="`最多 ${remoteConfig.maxTitleLength} 个字符`"
            />
            <BaseInput
              v-model="form.contact"
              label="联系方式"
              :disabled="submitting"
              placeholder="选填，例如 QQ / 邮箱"
            />
            <BaseSelect
              v-model="form.category"
              label="问题类型"
              :options="remoteConfig.categoryOptions"
              :disabled="submitting"
            />
            <BaseSelect
              v-model="form.severity"
              label="严重程度"
              :options="remoteConfig.severityOptions"
              :disabled="submitting"
            />
          </div>

          <div class="mt-4 space-y-4">
            <div>
              <BaseTextarea
                v-model="form.description"
                label="问题描述"
                :disabled="submitting"
                :rows="5"
                :placeholder="`请尽量描述清楚现象、触发时机和影响范围，最多 ${remoteConfig.maxDescriptionLength} 个字符`"
              />
              <p class="glass-text-muted mt-1 text-[11px]">
                {{ form.description.trim().length }}/{{ remoteConfig.maxDescriptionLength }}
              </p>
            </div>
            <BaseTextarea
              v-model="form.stepsToReproduce"
              label="复现步骤"
              :disabled="submitting"
              :rows="4"
              placeholder="选填，建议按 1. 2. 3. 的顺序描述"
            />
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BaseTextarea
                v-model="form.expectedResult"
                label="期望结果"
                :disabled="submitting"
                :rows="3"
                placeholder="选填"
              />
              <BaseTextarea
                v-model="form.actualResult"
                label="实际结果"
                :disabled="submitting"
                :rows="3"
                placeholder="选填"
              />
            </div>
          </div>

          <div class="bug-report-summary mt-5 rounded-2xl px-4 py-4">
            <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
              <div class="i-carbon-data-view text-base" />
              自动附带信息
            </div>
            <ul class="m-0 list-disc pl-5 text-sm leading-7">
              <li v-for="item in autoCollectedSummary" :key="item">
                {{ item }}
              </li>
            </ul>
          </div>

          <div v-if="validationErrors.length > 0" class="glass-text-muted mt-4 text-xs">
            {{ validationErrors[0] }}
          </div>
        </div>

        <div class="bug-report-footer flex items-center justify-between gap-3 px-6 py-4">
          <p class="glass-text-muted text-xs leading-5">
            提交后会优先把反馈入库，再尝试发送邮件；即使邮件失败，反馈也不会直接丢失。
          </p>
          <div class="flex items-center gap-2">
            <BaseButton variant="secondary" size="sm" :disabled="submitting" @click="handleClose">
              关闭
            </BaseButton>
            <BaseButton variant="primary" size="sm" :loading="submitting" @click="handleSubmit">
              提交反馈
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bug-report-modal {
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 16%, transparent);
}

.bug-report-panel,
.bug-report-header,
.bug-report-footer,
.bug-report-close,
.bug-report-summary,
.bug-report-disabled,
.bug-report-success {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
}

.bug-report-icon {
  color: var(--ui-status-danger);
  background:
    radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--ui-status-danger) 18%, transparent), transparent 65%),
    color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface));
}

.bug-report-header {
  border-width: 0 0 1px;
}

.bug-report-footer {
  border-width: 1px 0 0;
}

.bug-report-close:hover {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
}

.bug-report-summary {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-brand-500) 8%, transparent), transparent 55%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
}

.bug-report-disabled {
  color: color-mix(in srgb, var(--ui-status-warning) 88%, var(--ui-text-1) 12%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-status-warning) 12%, transparent), transparent 70%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 86%, transparent);
}

.bug-report-success {
  color: color-mix(in srgb, var(--ui-status-success) 88%, var(--ui-text-1) 12%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-status-success) 12%, transparent), transparent 70%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 86%, transparent);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.22s ease;
}

.modal-enter-active .bug-report-panel,
.modal-leave-active .bug-report-panel {
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .bug-report-panel,
.modal-leave-to .bug-report-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}
</style>
