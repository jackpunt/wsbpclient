import { BaseDriver, WebSocketBase } from '../src/BaseDriver'
import { DataBuf, stime, EzPromise, pbMessage} from '../src/types'

var base = new BaseDriver<pbMessage, pbMessage>()
var pbase = new EzPromise<BaseDriver<pbMessage, pbMessage>>()
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

var wsbase = new WebSocketBase<pbMessage, pbMessage>() 
var pwsbase = new EzPromise<WebSocketBase<pbMessage, pbMessage>>()
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

