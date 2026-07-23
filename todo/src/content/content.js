(() => {
  if (document.getElementById("todo-extension-root")) return;

  const root = document.createElement("div");
  root.id = "todo-extension-root";
  root.innerHTML = `<button class="todo-ball" type="button" title="todo" aria-label="todo">0</button>`;
  document.documentElement.appendChild(root);
})();
