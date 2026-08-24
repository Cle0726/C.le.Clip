let installed = false;

function replay(element: HTMLElement | null, className: string, duration: number) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function markNewClip(node: Node) {
  if (!(node instanceof HTMLElement)) return;

  const clips = node.matches(".reference-clip")
    ? [node]
    : Array.from(node.querySelectorAll<HTMLElement>(".reference-clip"));

  for (const clip of clips) {
    clip.classList.add("motion-new");
    window.setTimeout(() => clip.classList.remove("motion-new"), 260);
  }
}

export function installMotionEffects() {
  if (installed) return;
  installed = true;

  const root = document.getElementById("root");
  if (!root) return;

  const detail = () => root.querySelector<HTMLElement>(".reference-detail");

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest(".reference-clip")) {
      requestAnimationFrame(() => replay(detail(), "motion-detail-swap", 230));
    }
  });

  const observer = new MutationObserver((records) => {
    let selectionChanged = false;

    for (const record of records) {
      if (record.type === "childList") {
        record.addedNodes.forEach(markNewClip);
      }

      if (
        record.type === "attributes"
        && record.target instanceof HTMLElement
        && record.target.classList.contains("reference-clip")
        && record.target.classList.contains("selected")
      ) {
        selectionChanged = true;
      }
    }

    if (selectionChanged) {
      requestAnimationFrame(() => replay(detail(), "motion-detail-swap", 230));
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}
