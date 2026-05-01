export const IPC = {
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_CHANGED: 'config:changed',

  ITEM_ADD: 'item:add',
  ITEM_EDIT: 'item:edit',
  ITEM_REMOVE: 'item:remove',
  ITEM_VALIDATE: 'item:validate',
  ITEM_CANCEL_VALIDATE: 'item:cancelValidate',

  KR_STOCK_RESOLVE: 'kr:stockResolve',

  DRAG_START: 'drag:start',
  DRAG_MOVE: 'drag:move',
  DRAG_END: 'drag:end',

  OPACITY_SET: 'opacity:set',
  ALWAYS_ON_TOP_SET: 'alwaysOnTop:set',
  AUTOSTART_SET: 'autostart:set',
  WINDOW_RESIZE_SAVE: 'window:resizeSave',
  MODAL_OPEN: 'modal:open',

  LINK_OPEN: 'link:open',

  MENU_SHOW: 'menu:show',
  MENU_OPEN_ADD_ITEM: 'menu:openAddItem',
  MENU_OPEN_SETTINGS: 'menu:openSettings',
  MENU_EDIT_ITEM: 'menu:editItem',

  PRICE_TICK: 'price:tick',
  PRICE_STATUS: 'price:status',

  APP_QUIT: 'app:quit'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
