<template>
  <main class="flex w-full h-screen items-center justify-center">
    <div>
      <h1 class="text-2xl font-bold mb-4">DATEX Demo</h1>
      <div>
        <ul>
          <li>Endpoint: <code class="select-all">{{ runtime.endpoint }}</code></li>
          <li>Version: <code>{{ runtime.version }}</code></li>
        </ul>

        <div class="mt-4">
            <ul class="flex flex-col gap-2 w-2xl">
              <li
                  v-for="inter in comHubStatus.interfaces.toSorted((a: any, b: any) => a.properties.interface_type.localeCompare(b.properties.interface_type))"
                  :key="inter.id"
                  class="bg-gray-900 rounded-md p-2"
              >
                <div>
                  <b>{{ inter.properties.interface_type }}/{{ inter.properties.channel }}</b><span v-if="inter.properties.name"> ({{ inter.properties.name }})</span>
                </div>
                <ul
                    v-for="socket in inter.sockets.sort((a: any, b: any) => {
                      if (a.properties.is_direct && !b.properties.is_direct) return -1;
                      if (!a.properties.is_direct && b.properties.is_direct) return 1;
                      return 0;
                    })"
                    class="ml-2">
                  <li :key="socket.uuid" :title="socket.uuid">
                    <div>
                      <span class="mr-2">
                        <span v-if="socket.direction == 'InOut'">◀─▶</span>
                        <span v-else-if="socket.direction == 'In'">◀─</span>
                        <span v-else-if="socket.direction == 'Out'">─▶</span>
                      </span>
                      <span class="text-endpoint select-all">{{ socket.endpoint }}</span>
                      <span v-if="socket.properties.is_direct" class="bg-cyan-600 px-1.5 py-0.5 rounded-md ml-2">direct</span>
                      <span v-if="socket.properties.distance !== undefined" class="bg-gray-600 px-1.5 py-0.5 rounded-md ml-2">distance: {{ socket.properties.distance }}</span>
                    </div>
                  </li>
                </ul>
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
console.log(comHubStatus.value)

</script>

<style scoped>

</style>
