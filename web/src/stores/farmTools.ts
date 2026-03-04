import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFarmToolsStore = defineStore('farmTools', () => {
  const isAvailable = ref(false)
  const isChecked = ref(false)

  async function checkAvailability() {
    if (isChecked.value) return isAvailable.value
    
    try {
      // 通过发出 HEAD 请求来检测插件资源是否存在
      const res = await fetch('/nc_api_version/index.html', { method: 'HEAD' })
      isAvailable.value = res.ok
    } catch (e) {
      isAvailable.value = false
    } finally {
      isChecked.value = true
    }
    
    return isAvailable.value
  }

  return { isAvailable, isChecked, checkAvailability }
})
