function zeroNumberInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement && target.type === 'number' &&
    !target.readOnly && !target.disabled && target.valueAsNumber === 0 ? target : null
}

export function enableZeroReplacement(doc: Document) {
  let pointerEntry: HTMLInputElement | null = null

  doc.addEventListener('focusin', event => {
    zeroNumberInput(event.target)?.select()
  })
  doc.addEventListener('pointerdown', event => {
    const input = zeroNumberInput(event.target)
    pointerEntry = event.button === 0 && input !== doc.activeElement ? input : null
  }, true)
  doc.addEventListener('click', event => {
    // A pointer entering the field can place the caret after the focus event.
    if (pointerEntry && pointerEntry === event.target && pointerEntry === doc.activeElement) {
      zeroNumberInput(pointerEntry)?.select()
    }
    pointerEntry = null
  }, true)
  doc.addEventListener('pointercancel', () => { pointerEntry = null }, true)
}
