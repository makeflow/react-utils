import hoistStatics from 'hoist-non-react-statics';
import {inject as _inject, observer as _observer} from 'mobx-react';
import {
  Component,
  ComponentType,
  Consumer,
  ReactElement,
  createElement,
  forwardRef,
} from 'react';
import {Dict} from 'tslang';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export function inject(storeKey: string): PropertyDecorator;
export function inject(target: Component, key: string): void;
export function inject(target: Component | string, key?: string): any {
  if (typeof target === 'string') {
    let storeKey = target;
    return (prototype: Component) => decorate(prototype, storeKey);
  } else if (key) {
    return decorate(target, key);
  } else {
    throw new Error('Invalid usage');
  }

  function decorate(target: any, storeKey: string): PropertyDescriptor {
    pushInjection(target, storeKey);

    return {
      get(this: any): any {
        return this.props[storeKey];
      },
    };
  }
}

export const context = createNamedInjectDecorator('context');

export interface NamedInjectDecorator {
  (key: string): PropertyDecorator;
  (target: Component, key: string): void;
}

export function createNamedInjectDecorator(
  storeKey: string,
): NamedInjectDecorator {
  return (target: Component | string, key?: string): any => {
    if (typeof target === 'string') {
      let key = target;
      return (prototype: Component) => decorate(prototype, key);
    } else if (key) {
      return decorate(target, key);
    } else {
      throw new Error('Invalid usage');
    }

    function decorate(target: any, syncableKey: string): any {
      pushInjection(target, storeKey);

      return {
        get(this: any): any {
          return this.props[storeKey][syncableKey];
        },
      };
    }
  };
}

function pushInjection(target: any, storeKey: string): void {
  if (hasOwnProperty.call(target, '_injections')) {
    target._injections.push(storeKey);
  } else {
    let injections: string[];

    if (target._injections) {
      injections = [...target._injections, storeKey];
    } else {
      injections = [storeKey];
    }

    Object.defineProperty(target, '_injections', {
      value: injections,
    });
  }
}

export type ConsumeDecorator = (target: Component, key: string) => void;

export function consume<T>(Consumer: Consumer<T>): ConsumeDecorator {
  return (target: Component, key: string): any => {
    pushConsumer(target, key, Consumer);

    return {
      get(this: any): any {
        return this.props[key];
      },
    };
  };
}

function pushConsumer(target: any, key: string, Consumer: Consumer<any>): void {
  if (hasOwnProperty.call(target, '_consumers')) {
    target._consumers.set(key, Consumer);
  } else {
    let consumers: [string, Consumer<any>][];

    if (target._consumers) {
      consumers = [...target._consumers, [key, Consumer]];
    } else {
      consumers = [[key, Consumer]];
    }

    Object.defineProperty(target, '_consumers', {
      value: new Map<string, Consumer<any>>(consumers),
    });
  }
}

interface InjectionStoreDict extends Dict<unknown> {
  injections: Dict<unknown>;
}

export function observer<T extends ComponentType<any>>(target: T): T {
  target = _observer(target) || target;

  let injectionNames = target.prototype._injections as string[] | undefined;

  let consumers = target.prototype._consumers as
    | Map<string, Consumer<any>>
    | undefined;

  if (consumers) {
    let original = target;

    target = forwardRef((props, ref) => {
      let consumerProps: any = {};
      let consumerEntries = Array.from(consumers!);

      return createConsumerWrapperOrTarget();

      function createConsumerWrapperOrTarget(): ReactElement<any> {
        let consumerEntry = consumerEntries.shift();

        if (consumerEntry) {
          let [key, Consumer] = consumerEntry;

          return createElement(Consumer, undefined, (value: any) => {
            consumerProps[key] = value;

            return createConsumerWrapperOrTarget();
          });
        } else {
          return createElement(original, {...consumerProps, ...props, ref});
        }
      }
    }) as T;

    hoistStatics(target, original);
  }

  if (injectionNames) {
    if (!target.prototype) {
      Object.defineProperty(target, 'prototype', {
        value: {
          __note: 'Hack for MobX React `isStateless` function',
          render() {},
        },
      });
    }

    target =
      _inject((storeDict: InjectionStoreDict) => {
        let injectionDict: Dict<unknown> = {};

        for (let name of injectionNames!) {
          if (hasOwnProperty.call(storeDict, name)) {
            injectionDict[name] = storeDict[name];
          } else {
            let {injections: storeInjectionDict} = storeDict;

            if (
              storeInjectionDict &&
              typeof storeInjectionDict === 'object' &&
              storeInjectionDict[name] !== undefined
            ) {
              injectionDict[name] = storeInjectionDict[name];
            }
          }
        }

        return injectionDict;
      })(target) || target;
  }

  return target;
}
