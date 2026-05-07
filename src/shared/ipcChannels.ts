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
  SYMBOL_SEARCH: 'symbol:search',

  DRAG_START: 'drag:start',
  DRAG_MOVE: 'drag:move',
  DRAG_END: 'drag:end',

  RESIZE_HANDLE_START: 'resize:handleStart',
  RESIZE_HANDLE_MOVE: 'resize:handleMove',
  RESIZE_HANDLE_END: 'resize:handleEnd',

  OPACITY_SET: 'opacity:set',
  ALWAYS_ON_TOP_SET: 'alwaysOnTop:set',
  AUTOSTART_SET: 'autostart:set',
  WINDOW_SET_CONTENT_SIZE: 'window:setContentSize',
  MODAL_OPEN: 'modal:open',

  LINK_OPEN: 'link:open',

  MENU_SHOW: 'menu:show',

  PRICE_TICK: 'price:tick',
  PRICE_STATUS: 'price:status',

  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ACCEPT_INSTALL: 'update:acceptInstall',

  APP_QUIT: 'app:quit',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
