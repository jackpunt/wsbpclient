import { BaseDriver, WebSocketBase } from '../src/BaseDriver'
import { DataBuf, stime, EzPromise} from '../src/types'

var base = new BaseDriver<DataBuf<any>, any>()
var pbase = new EzPromise<BaseDriver<DataBuf<any>, any>>()
test("BaseDriver.constructor", () => {
  expect(base).toBeInstanceOf(BaseDriver)
  pbase.fulfill(base)
})

test("BaseDriver.connect", done => {
  pbase.then((base) => {
    expect(base).toBeTruthy()
    done()
  })
}) 

var wsbase = new WebSocketBase<DataBuf<any>, DataBuf<any>>() 
var pwsbase = new EzPromise<WebSocketBase<DataBuf<any>, any>>()
test("WebSocketBase.construct", () => {
    expect(wsbase).toBeInstanceOf(WebSocketBase)
    pwsbase.fulfill(wsbase)
}) 

test("WebSocketBase.connect", done => {
  pwsbase.then((wsbase) => {
    expect(wsbase).toBeTruthy()
    done()
  })
}) 

