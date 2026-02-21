<template>
  <main class="flex w-full h-screen items-center justify-center">
    <div>
      <h1 class="text-2xl font-bold mb-4">DATEX Demo</h1>
      <div>
        <ul>
          <li>Endpoint: <code>{{ runtime.endpoint }}</code></li>
          <li>Version: <code>{{ runtime.version }}</code></li>
        </ul>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { runtime } from "../demo/demo-runtime.ts";

</script>

<style scoped>

</style>
