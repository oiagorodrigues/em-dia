<script setup lang="ts">
import Stamp from "@/components/ui/Stamp.vue";
import Wordmark from "@/components/ui/Wordmark.vue";

const SAMPLE = [
  { wd: "S", d: "05", in: "08:02", out: "16:10", total: "7h08" },
  { wd: "T", d: "06", stamp: "Falta" },
  { wd: "Q", d: "07", in: "07:58", out: "17:01", total: "8h03" },
] as const;
</script>

<template>
  <div class="auth">
    <aside class="auth__panel" aria-hidden="true">
      <Wordmark :size="36" />
      <p class="auth__pitch display">
        a casa em dia com quem cuida dela<span class="auth__dot">.</span>
      </p>
      <div class="auth__sample">
        <div class="auth__perf" />
        <div v-for="row in SAMPLE" :key="row.d" class="auth__row">
          <span class="auth__day"
            ><span class="auth__wd">{{ row.wd }}</span
            ><span class="mono">{{ row.d }}</span></span
          >
          <template v-if="'stamp' in row">
            <span class="auth__stamp"><Stamp :text="row.stamp" size="md" /></span>
          </template>
          <template v-else>
            <span class="mono auth__ink">{{ row.in }}</span>
            <span class="mono auth__ink">{{ row.out }}</span>
            <span class="mono auth__total">{{ row.total }}</span>
          </template>
        </div>
      </div>
      <p class="auth__foot">
        Horas, faltas, extras e pagamentos de diaristas, babás e cuidadoras. Os dois lados anotam,
        os dois confirmam.
      </p>
    </aside>

    <main id="conteudo" class="auth__main">
      <div class="auth__mobile-brand"><Wordmark :size="32" /></div>
      <div class="auth__form">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100dvh;
  display: grid;
}

.auth__panel {
  display: none;
}

.auth__main {
  display: flex;
  flex-direction: column;
  padding: calc(var(--s-7) + env(safe-area-inset-top)) var(--gutter)
    calc(var(--s-8) + env(safe-area-inset-bottom));
}

.auth__mobile-brand {
  margin-bottom: var(--s-8);
}

.auth__form {
  width: 100%;
  max-width: 420px;
}

@media (min-width: 960px) {
  .auth {
    grid-template-columns: minmax(0, 1.1fr) minmax(420px, 1fr);
  }

  .auth__panel {
    display: flex;
    flex-direction: column;
    gap: var(--s-8);
    padding: var(--s-8) var(--s-9);
    background: var(--surface);
    border-right: 1px solid var(--rule);
    position: sticky;
    top: 0;
    height: 100dvh;
  }

  .auth__pitch {
    font-size: clamp(3rem, 5.4vw, var(--t-96));
    max-width: 11ch;
    margin-top: auto;
  }

  .auth__dot {
    color: var(--coral);
  }

  .auth__sample {
    position: relative;
    max-width: 440px;
    border: 1px solid var(--rule);
    border-radius: var(--r-2);
    background: var(--bg);
    padding-top: 10px;
    transform: rotate(-1.2deg);
  }

  .auth__perf {
    position: absolute;
    inset: 0 0 auto;
    height: 7px;
    background: radial-gradient(circle at 50% 0, var(--surface) 4px, transparent 4.5px) 0 0 / 16px
      8px repeat-x;
  }

  .auth__row {
    display: grid;
    grid-template-columns: 56px 1fr 1fr 0.8fr;
    align-items: center;
    min-height: 46px;
    padding: 0 var(--s-4);
    font-size: var(--t-14);
  }

  .auth__row + .auth__row {
    border-top: 1px solid var(--rule);
  }

  .auth__day {
    display: flex;
    gap: 6px;
    font-weight: 600;
  }

  .auth__wd {
    color: var(--ink-2);
    font-size: var(--t-12);
  }

  .auth__stamp {
    grid-column: 2 / span 3;
  }

  .auth__ink {
    color: var(--brand);
  }

  .auth__total {
    font-weight: 700;
  }

  .auth__foot {
    max-width: 44ch;
    color: var(--ink-2);
  }

  .auth__main {
    justify-content: center;
    align-items: center;
    padding: var(--s-9) var(--s-8);
  }

  .auth__mobile-brand {
    display: none;
  }
}
</style>
