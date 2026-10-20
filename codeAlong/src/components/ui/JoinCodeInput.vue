<script setup>
import { ref, watch } from 'vue'
import { Limits } from '@shared/constants.js'
import { isJoinCodeChar } from '@shared/join-code.js'

// Six boxes for a join code, one character each. Letters are capitalised as you type, and
// keys that can't be in a code (0, O, 1, I, L, symbols) are ignored. Emits `complete` when full.
// Use: <JoinCodeInput v-model="code" @complete="join" />
const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false }, // red outline, e.g. after "No live class with that code"
})
const emit = defineEmits(['update:modelValue', 'complete'])

const LENGTH = Limits.JOIN_CODE_LENGTH
const chars = ref(Array(LENGTH).fill(''))
const boxes = ref([])

// a code set from outside (e.g. /join/K7QM2P from a QR code) fills the boxes
watch(
  () => props.modelValue,
  (code) => {
    if (code !== chars.value.join('')) {
      chars.value = Array.from({ length: LENGTH }, (_, i) => code[i] ?? '')
    }
  },
  { immediate: true },
)

function update() {
  const code = chars.value.join('')
  emit('update:modelValue', code)
  if (chars.value.every(Boolean)) emit('complete', code)
}

const focusBox = (i) => boxes.value[Math.max(0, Math.min(i, LENGTH - 1))]?.focus()

function onInput(i, event) {
  if (event.target.value === '') {
    // Backspace or Delete emptied the box
    chars.value[i] = ''
    update()
    return
  }
  const ch = event.target.value.slice(-1).toUpperCase()
  if (!isJoinCodeChar(ch)) {
    event.target.value = chars.value[i] // not allowed in a code: put the box back as it was
    return
  }
  chars.value[i] = ch
  event.target.value = ch
  update()
  focusBox(i + 1)
}

function onKeydown(i, event) {
  if (event.key === 'Backspace' && !chars.value[i] && i > 0) {
    // empty box: step back and clear the one before
    event.preventDefault()
    chars.value[i - 1] = ''
    update()
    focusBox(i - 1)
  } else if (event.key === 'ArrowLeft') {
    focusBox(i - 1)
  } else if (event.key === 'ArrowRight') {
    focusBox(i + 1)
  }
}

// pasting a whole code fills the boxes from here on, keeping only allowed characters
function onPaste(i, event) {
  event.preventDefault()
  const pasted = [...(event.clipboardData?.getData('text') ?? '').toUpperCase()].filter(
    isJoinCodeChar,
  )
  pasted.slice(0, LENGTH - i).forEach((ch, k) => (chars.value[i + k] = ch))
  update()
  focusBox(i + pasted.length)
}
</script>

<template>
  <div
    class="d-flex justify-content-center gap-2"
    data-testid="input-join-code"
  >
    <input
      v-for="(ch, i) in chars"
      :key="i"
      :ref="(el) => (boxes[i] = el)"
      :value="ch"
      class="ca-input ca-join-box text-center fw-semibold"
      maxlength="1"
      inputmode="text"
      autocapitalize="characters"
      autocomplete="off"
      spellcheck="false"
      :class="{ 'ca-input--invalid': invalid }"
      :disabled="disabled"
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste(i, $event)"
      @focus="$event.target.select()"
    />
  </div>
</template>
