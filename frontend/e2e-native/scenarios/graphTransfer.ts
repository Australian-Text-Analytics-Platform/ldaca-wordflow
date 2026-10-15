import { browser, $, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { request } from '@/api/client';

/** Real input routing and graph state; native DOM gestures compensate only for
 * the embedded driver's missing HTML drag/view/held-button fields. */
export async function graphTransferScenario(base: string, name: string) {
  await request(base,'/api/project/import','post',{body:{sources:[{table_name:name,sql:"SELECT 'Café 猫' AS text"}]}});
  await $('button[aria-label="Frequency"]').click();
  await $('button[aria-label="Fit view"]').click();
  const node = $(`.react-flow__node[data-id="${name}"]`);
  const card = node.$('[data-testid$="card"]');
  const panel = $('[data-input-destination]');
  await card.waitForDisplayed(); await panel.waitForDisplayed();
  await expect(card).toHaveAttribute('draggable','true');
  const initial = await node.getAttribute('style');
  const native = await browser.execute(() => '__TAURI_INTERNALS__' in window);
  if (native) {
    await browser.execute((name) => {
      const card = document.querySelector(`.react-flow__node[data-id="${name}"] [data-testid$="card"]`)!;
      const panel = document.querySelector('[data-input-destination]')!;
      const dataTransfer = new DataTransfer();
      card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
      panel.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer}));
      panel.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));
      card.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
    },name);
  } else await card.dragAndDrop(panel,{duration:1000});
  await expect(panel).toHaveText(expect.stringContaining(name));
  await expect(node).toHaveAttribute('style',initial ?? '');
  const mac = await browser.execute(() => /Mac|iPhone|iPad/.test(navigator.platform));
  if (native) {
    await browser.execute(async ({name,mac}) => {
      window.dispatchEvent(new KeyboardEvent('keydown',{key:mac?'Meta':'Control',metaKey:mac,ctrlKey:!mac,bubbles:true}));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const target = document.querySelector(`.react-flow__node[data-id="${name}"] [data-testid$="card"]`)!;
      const rect = target.getBoundingClientRect(), x=rect.x+rect.width/2, y=rect.y+rect.height/2;
      const event = (type:string,step:number,buttons:number) => new MouseEvent(type,{bubbles:true,cancelable:true,view:window,button:0,buttons,clientX:x+step*5,clientY:y+step*3,metaKey:mac,ctrlKey:!mac});
      target.dispatchEvent(event('mousedown',0,1));
      for(let step=1;step<=8;step++) { window.dispatchEvent(event('mousemove',step,1)); await new Promise((resolve)=>setTimeout(resolve,16)); }
      window.dispatchEvent(event('mouseup',8,0));
      window.dispatchEvent(new KeyboardEvent('keyup',{key:mac?'Meta':'Control',bubbles:true}));
    },{name,mac});
  } else {
    const modifier = mac ? Key.Command : Key.Control;
    await browser.action('key',{id:'graph-modifier'}).down(modifier).perform(true);
    try {
      await expect(card).toHaveAttribute('draggable','false');
      const point = await card.execute((element)=> {const r=element.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}) as {x:number; y:number};
      const drag = browser.action('pointer').move(point).down();
      for (let step=1; step<=8; step++) drag.move({x:point.x+step*5,y:point.y+step*3,duration:60});
      await drag.up().perform(true);
    } finally { await browser.action('key',{id:'graph-modifier'}).up(modifier).perform(); }
  }
  await expect(node).not.toHaveAttribute('style',initial ?? '');
  const viewport = $('.react-flow__viewport'); const transform = await viewport.getAttribute('style');
  await card.doubleClick();
  await expect(viewport).toHaveAttribute('style',transform ?? '');
  await expect(card).toHaveAttribute('draggable','true');
}
