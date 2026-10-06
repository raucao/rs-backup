export default function rateLimited(func, rate) {
  let tail = Promise.resolve();

  return function (...args) {
    const run = tail.then(async () => {
      if (rate > 0) {
        await new Promise((resolve) => setTimeout(resolve, rate));
      }
      return func(...args);
    });

    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}
