/*
 * Nastavení webu.
 *
 * githubRepo  – repozitář, ve kterém jsou uložena data zásilek, ve tvaru "uzivatel/repozitar".
 * githubBranch – větev, ze které GitHub Pages web publikuje (obvykle "main").
 *
 * Dokud je githubRepo prázdné, web běží v DEMO režimu: data jsou jen v localStorage
 * vašeho prohlížeče, přihlášení není potřeba a nic se nikam neodesílá.
 *
 * Přístupový token GitHubu se nikdy nepíše sem. Zadáváte ho jen v panelu správy.
 */
window.TRASA_CONFIG = {
  githubRepo: 'o5-dev/tracking',
  githubBranch: 'main'
};
