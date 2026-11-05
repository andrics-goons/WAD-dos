<script setup>
// profile page: the courses I'm a TA in. being a TA is per course, so the page shows
// my account type (Student or Educator) and the courses are listed here.
defineProps({ courses: { type: Array, required: true } }) // { id, title, code, section, term }
</script>

<template>
  <div data-testid="ta-courses">
    <h2 class="h3">Teaching assistant</h2>
    <p class="text-body-secondary small">You help run these courses.</p>
    <ul class="list-group list-group-flush">
      <li v-for="c in courses" :key="c.id" class="list-group-item px-0">
        <RouterLink :to="{ name: 'course', params: { id: c.id } }">{{ c.title }}</RouterLink>
        <div class="small text-body-secondary">{{ c.code }} · {{ c.section }} · {{ c.term }}</div>
      </li>
    </ul>
  </div>
</template>
