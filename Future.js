var Future = (function () {
        /*
        * Because Futures are used with such frequency we needed to optimize them. One of the ways
        * that we did that was by making all the futures share the same state objects, and pass the future
        * as the first parameter to every function so the state objects knows what future to act on.
        * This was a tremendous memory gain, there was 15 times less memory in use with the new paradigm.
        */
        var emptyFn = function (future) {
            return future;
        };
        
        var notifyFutureIsComplete = function (future) {
            future._callbacks["finally"].forEach(function (callback) {
                callback();
            });
            
            Object.keys(future._callbacks).forEach(function (type) {
                future._callbacks[type] = [];
            });
        };
        
        var invokeCallback = function (future, callback) {
            if (typeof callback === "function") {
                callback();
            }
            
            return future;
        };
        
        var _initialState = {
            "try": function (future) {
                future._state = future._retrievingState;
				
                // This resolver will be injectable someday.
				var resolver = {
					resolve:function (value) {
						if (future._state === future._retrievingState) {
							future.value = value;
							future.isDone = true;
							future.isComplete = true;
							
							future._state = future._doneState;
							
							future._callbacks.then.forEach(function (callback) {
								callback(value);
							});
						}
						
						notifyFutureIsComplete(future);
					},
					reject: function (error) {
						if (future._state === future._retrievingState) {
							future.error = error;
							future.isDone = true;
							future.isComplete = true;
							future._state = future._errorState;
							
							future._callbacks["ifError"].forEach(function (callback) {
								callback(error);
							});
						}
						
						notifyFutureIsComplete(future);
					},
					cancel: function(reason){
						return future.cancel(reason);
					},
					ifCanceled: function (callback) {
						return future.ifCanceled(callback);
					}
				};               
                
                future._getValue(resolver);
                
                return future;
            },
            then: function (future, callback) {
                if (typeof callback === "function") {
                    future._callbacks.then.push(callback);
                }
                return future;
            },
            "catch": function (future, callback) {
                var wrappedFuture = new Future(function (resolver) {
                    
					var resolve = resolver.resolve;
					var reject = resolver.reject;
					var cancel = resolver.cancel;
					var ifCanceled = resolver.ifCanceled;
					
                    future.ifError(function (error) {
                        var nextFuture = callback(error);
                        
                        if (nextFuture instanceof Future) {
                            nextFuture.then(resolve);
                            nextFuture.ifError(reject);
                            nextFuture.ifCanceled(cancel);
                            
                            ifCanceled(function (reason) {
                                nextFuture.cancel(reason);
                            });
                        } else {
                            resolve(nextFuture);
                        }
                    });
                    
                    future.ifCanceled(cancel);
                    future.then(resolve);

                });
                
                wrappedFuture.ifCanceled(function () {
                    future.cancel();
                });
                
                return wrappedFuture;
            },
            catchCanceled: function (future, callback) {
                var wrappedFuture = new Future(function (resolver) {
                    
					var resolve = resolver.resolve;
					var reject = resolver.reject;
					var cancel = resolver.cancel;
					var ifCanceled = resolver.ifCanceled;
					
                    future.ifCanceled(function (reason) {
                        var nextFuture = callback(reason);
                        
                        if (nextFuture instanceof Future) {
                            nextFuture.then(resolve);
                            nextFuture.ifError(reject);
                            nextFuture.ifCanceled(cancel);
                            
                            ifCanceled(function (reason) {
                                nextFuture.cancel(reason);
                            });
                        } else {
                            resolve(nextFuture);
                        }
                    });
                    
                    future.then(resolve);
                    future.ifError(reject);

                });
                
                wrappedFuture.ifCanceled(function () {
                    future.cancel();
                });
                
                return wrappedFuture;

            },
            ifCanceled: function (future, callback) {
                future._callbacks.ifCanceled.push(callback);
                return future;
            },
            ifError: function (future, callback) {
                if (typeof callback === "function") {
                    future._callbacks.ifError.push(callback);
                }
                return future;
            },
            chain: function (future, callback) {
                
                var wrappedFuture = new Future(function (resolver) {
                    
					var resolve = resolver.resolve;
					var reject = resolver.reject;
					var cancel = resolver.cancel;
					var ifCanceled = resolver.ifCanceled;
					
                    future.then(function (value) {
                        var nextFuture = callback(value);
                        
                        if (nextFuture instanceof Future) {
                            nextFuture.then(resolve);
                            nextFuture.ifError(reject);
                            nextFuture.ifCanceled(cancel);
                            
                            ifCanceled(function (reason) {
                                nextFuture.cancel(reason);
                            });
                        } else {
                            resolve(nextFuture);
                        }
                    });
                    
                    future.ifCanceled(cancel);
                    future.ifError(reject);
                });
                
                wrappedFuture.ifCanceled(function (reason) {
                    future.cancel(reason);
                });
                
                return wrappedFuture;
            },
            cancel: function (future, cancelationMessage) {
                future.isDone = true;
                future.isComplete = true;
                future.isCanceled = true;
                future._state = future._canceledState;
                future.cancelationMessage = cancelationMessage;
                future._callbacks.ifCanceled.forEach(function (callback) {
                    callback(cancelationMessage);
                });
                notifyFutureIsComplete(future);
                return future;
            },
            "finally": function (future, callback) {
                if (typeof callback === "function") {
                    future._callbacks["finally"].push(callback);
                }
                return future;
            }
        };
        
        var _retrievingState = {
            "try": emptyFn,
            then: _initialState.then,
            "catch": _initialState["catch"],
            catchCanceled: _initialState.catchCanceled,
            ifCanceled: _initialState.ifCanceled,
            chain: _initialState.chain,
            ifError: _initialState.ifError,
            cancel: _initialState.cancel,
            "finally": _initialState["finally"]
        };
        
        var _doneState = {
            "try": emptyFn,
            then: function (future, callback) {
                callback(future.value);
                return future;
            },
            "catch": _initialState["catch"],
            ifError: emptyFn,
            catchCanceled: emptyFn,
            ifCanceled: emptyFn,
            chain: _initialState.chain,
            cancel: emptyFn,
            "finally": invokeCallback
        };
        
        var _errorState = {
            "try": emptyFn,
            then: emptyFn,
            "catch": _initialState["catch"],
            ifError: function (future, callback) {
                callback(future.error);
                return future;
            },
            catchCanceled: emptyFn,
            ifCanceled: emptyFn,
            chain: _initialState.chain,
            cancel: emptyFn,
            "finally": invokeCallback
        };
        
        var _canceledState = {
            "try": emptyFn,
            then: emptyFn,
            "catch": _initialState["catch"],
            catchCanceled: _initialState.catchCanceled,
            ifCanceled: function (future, callback) {
                callback(future.cancelationMessage);
                return future;
            },
            ifError: emptyFn,
            chain: _initialState.chain,
            cancel: emptyFn,
            "finally": invokeCallback
        };
        
        var TIME_OUT_TEXT = "Timed out.";
        
        var Future = function (getValue) {
            this._callbacks = {
                "finally": [],
                chain: [],
                ifCanceled: [],
                then: [],
                ifError: []
            };
            this._state = null;
            this._initialState = _initialState;
            this._retrievingState = _retrievingState;
            this._doneState = _doneState;
            this._errorState = _errorState;
            this._canceledState = _canceledState;
            this.value = null;
            this.error = null;
            this.isDone = false;
            this.cancelationMessage = null;
            var self = this;
            self._getValue = getValue;
            self._state = self._initialState;
            
            if (typeof self._getValue !== "function") {
                self._getValue = emptyFn;
            }
        };
        
        Future.prototype["try"] = function () {
            return this._state["try"](this);
        };
        
        Future.prototype.then = function (callback) {
            if (typeof callback !== "function") {
                callback = function () { };
                //console.log("Deprecated, use try instead when wanting to start execution.");
            }
            this["try"]();
            return this._state.then(this, callback);
        };
        
        Future.prototype["catch"] = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            return this._state["catch"](this, callback);
        };
        
        Future.prototype.catchCanceled = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            return this._state.catchCanceled(this, callback);
        };
        
        Future.prototype.ifCanceled = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            return this._state.ifCanceled(this, callback);
        };
        
        Future.prototype.chain = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            return this._state.chain(this, callback);
        };
        
        Future.prototype.ifError = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            return this._state.ifError(this, callback);
        };
        
        Future.prototype["finally"] = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            return this._state["finally"](this, callback);
        };
        
        Future.prototype.cancel = function (reason) {
            if (typeof reason === "undefined") { reason = "Unknown"; }
            return this._state.cancel(this, reason);
        };
        
        Future.prototype.setTimeout = function (milliseconds) {
            var self = this;
            setTimeout(function () {
                self.cancel(TIME_OUT_TEXT);
            }, milliseconds);
            return this;
        };
        
        Future.prototype.ifTimedOut = function (callback) {
            if (typeof callback !== "function") {
                throw new Error("The callback must be a function");
            }
            this.ifCanceled(function (reason) {
                if (reason === TIME_OUT_TEXT) {
                    callback();
                }
            });
            return this;
        };
        
        Future.prototype.onComplete = Future.prototype["finally"];
        
        Future.fromResult = function (value) {
            return new Future(function (resolver) {
                resolver.resolve(value);
            })["try"]();
        };
        
        Future.fromCanceled = function (reason) {
            var future = new Future(function (resolver) { 
				resolver.cancel(reason)
			});
            return future;
        };
        
        Future.fromError = function (error) {
            return new Future(function (resolver) {
                resolver.reject(error);
            })["try"]();
        };
        
        Future.all = function (futures) {
            var length = futures.length;
            var results = new Array(length);
            
            futures = futures.map(function (value) {
                if (value instanceof Future) {
                    return value;
                } else {
                    return Future.fromResult(value);
                }
            });
            
            var future = new Future(function (resolver) {
				
				var resolve = resolver.resolve;
				var reject = resolver.reject;
				var cancel = resolver.cancel;
				var ifCanceled = resolver.ifCanceled;	
                var doneCount = 0;
                
                if (futures.length === 0) {
                    resolve([]);
                } else {
                    futures.forEach(function (future, index) {
                        future.then(function (value) {
                            results[index] = value;
                            doneCount++;
                            if (doneCount === length) {
                                resolve(results);
                            }
                        }).ifError(function (e) {
                            
                            reject(e);
                        }).ifCanceled(cancel);
                    });
                }
            });
            
            return future;
        };
        
        return Future;

    }());