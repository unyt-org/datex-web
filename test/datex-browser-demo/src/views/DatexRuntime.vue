<template>
  <main class="flex w-full h-screen items-center justify-center">
    <div>
      <h1 class="text-2xl font-bold mb-4">DATEX Demo</h1>
      <div>
        <ul>
          <li>Endpoint: <code>{{ runtime.endpoint }}</code></li>
          <li>Version: <code>{{ runtime.version }}</code></li>
        </ul>

        <div class="mt-4">
            <ul>
              <li v-for="interf in comHubStatus.interfaces">
                <b>{{ interf.properties.interface_type }}/{{ interf.properties.channel }}</b><span v-if="interf.properties.name"> ({{ interf.properties.name }})</span>
                 - <code>{{ interf.properties.protocol }}</code>
              </li>
            </ul>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { runtime } from "../demo/demo-runtime.ts";
import {ref} from "vue";
const comHubStatus = ref(runtime.comHub.getMetadata());
setInterval(() => {
  comHubStatus.value = runtime.comHub.getMetadata();
}, 500);

</script>

<style scoped>

</style>
