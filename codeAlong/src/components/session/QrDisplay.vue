<script setup>
import { ref, watchEffect } from 'vue'
import QRCode from 'qrcode' // Source: https://github.com/soldair/node-qrcode (MIT)

// a QR code for a link, e.g. the join link the projector shows
const props = defineProps({ text: { type: String, required: true } })

const src = ref('')
watchEffect(async () => {
  src.value = await QRCode.toDataURL(props.text, { margin: 1, width: 200 })
})
</script>

<template>
  <img v-if="src" :src="src" :alt="`QR code for ${text}`" class="rounded border" />
</template>
